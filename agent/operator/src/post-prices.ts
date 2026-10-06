/**
 * Price relay: reads reference USD prices per asset and posts them to PostedPriceOracle on
 * Robinhood Chain with the OPERATOR key.
 *
 * Sources (per asset, see src/price-sources.ts for the maths):
 *   coingecko   CoinGecko token_price, platform "robinhood"              (CASHCAT, PONS, AI)
 *   pons-curve  marginal price of a Pons V2 launch curve, quoteReserve ÷ tokenReserve in ETH,
 *               × CoinGecko ETH/USD. The curve is resolved through PonsV2LaunchFactory
 *               .getLaunchedToken(asset).curve and must exist and not be graduated.   (RBL)
 *
 * Env: RPC_URL, ORACLE_ADDRESS, OPERATOR_PRIVATE_KEY (or use --dry-run), CHAIN_ID (4663|46630)
 * Optional: INTERVAL_SEC (default 300), ASSETS (comma list: `0xaddr` = coingecko, `0xaddr:pons-curve`;
 *           default = the registry assets below), PONS_FACTORY_ADDRESS (override; default: the
 *           mainnet factory), MAX_DEVIATION_BPS (default 2000)
 *
 * Safety: skips an update when the move exceeds MAX_DEVIATION_BPS and logs loudly instead; an
 * ADMIN must acknowledge with forcePrice. Never posts a zero price. A curve price is skipped
 * when the implied FDV is outside [$100, $1e9]. GRADUATION: once `graduated()` is true the
 * liquidity has moved to a Uniswap v4 pool; the relay stops posting that asset and logs an
 * error every tick (the posted price goes stale and the vault marks the asset UNAVAILABLE)
 * until a v4 source exists. It never guesses.
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, defineChain, getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { curvePriceEth1e18, ethToUsd1e18, fmtUsd, parseAssetsEnv, priceSanity, type RelayAsset } from "./price-sources";

const ASSETS_DEFAULT: readonly RelayAsset[] = [
  { symbol: "CASHCAT", address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", source: "coingecko" },
  { symbol: "PONS", address: "0x39dBED3a2bd333467115dE45665cC57F813C4571", source: "coingecko" },
  { symbol: "AI", address: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18", source: "coingecko" },
  // Roblette (RBL): trades only on its Pons V2 launch curve (no Uniswap pool before graduation).
  { symbol: "RBL", address: "0x041f48E1C2855be1287B94363f4f3D8585ceCCdc", source: "pons-curve" },
];

/** PonsV2LaunchFactory on Robinhood Chain mainnet (chain 4663), verified on Blockscout. */
const PONS_FACTORY_4663 = getAddress("0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e");

const abi = parseAbi([
  "function postPrices(address[] assets, uint256[] prices, uint256[] updatedAts)",
  "function getPrice(address asset) view returns (uint256 priceUsd1e18, uint256 updatedAt)",
  "function maxDeviationBps() view returns (uint16)",
]);
const ponsFactoryAbi = parseAbi([
  "function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))",
]);
const ponsCurveAbi = parseAbi([
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function graduated() view returns (bool)",
  "function isNativeQuote() view returns (bool)",
  "function token() view returns (address)",
]);
const erc20Abi = parseAbi(["function totalSupply() view returns (uint256)", "function decimals() view returns (uint8)"]);

const once = process.argv.includes("--once");
const dry = process.argv.includes("--dry-run");
const rpc = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const chainId = Number(process.env.CHAIN_ID ?? 4663);
const chain = defineChain({ id: chainId, name: chainId === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const oracle = process.env.ORACLE_ADDRESS ? getAddress(process.env.ORACLE_ADDRESS) : undefined;
const maxDev = Number(process.env.MAX_DEVIATION_BPS ?? 2000);
const ponsFactory: Address | undefined = process.env.PONS_FACTORY_ADDRESS ? getAddress(process.env.PONS_FACTORY_ADDRESS) : chainId === 4663 ? PONS_FACTORY_4663 : undefined;
const assets = parseAssetsEnv(process.env.ASSETS, ASSETS_DEFAULT);

const pub = createPublicClient({ chain, transport: http(rpc) });

interface Quote {
  /** USD per whole token, 1e18. */
  priceUsd1e18: bigint;
  updatedAt: number;
  /** Human line for the log. */
  detail: string;
}

async function fetchCoingecko(address: string): Promise<Quote> {
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/robinhood?contract_addresses=${address.toLowerCase()}&vs_currencies=usd&include_last_updated_at=true`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = (await r.json()) as Record<string, { usd?: number; last_updated_at?: number }>;
  const row = j[address.toLowerCase()];
  if (!row?.usd || row.usd <= 0) throw new Error("no price");
  return { priceUsd1e18: parseUnits(row.usd.toFixed(18), 18), updatedAt: row.last_updated_at ?? Math.floor(Date.now() / 1000), detail: `$${row.usd} (coingecko)` };
}

/** ETH/USD from CoinGecko, fetched at most once per tick. */
let ethUsdCache: { at: number; value: bigint } | null = null;
async function ethUsd1e18(): Promise<bigint> {
  if (ethUsdCache && Date.now() - ethUsdCache.at < 60_000) return ethUsdCache.value;
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = (await r.json()) as { ethereum?: { usd?: number } };
  const usd = j.ethereum?.usd;
  if (!usd || usd <= 0) throw new Error("no ETH/USD price");
  ethUsdCache = { at: Date.now(), value: parseUnits(usd.toFixed(8), 18) };
  return ethUsdCache.value;
}

async function fetchPonsCurve(asset: RelayAsset): Promise<Quote> {
  if (!ponsFactory) throw new Error("PONS_FACTORY_ADDRESS is required off chain 4663");
  const token = getAddress(asset.address);
  const launch = await pub.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "getLaunchedToken", args: [token] });
  if (!launch.exists) throw new Error(`not launched on PonsV2LaunchFactory ${ponsFactory}`);
  const curve = getAddress(launch.curve);
  const [graduated, native, curveToken] = await Promise.all([
    pub.readContract({ address: curve, abi: ponsCurveAbi, functionName: "graduated" }),
    pub.readContract({ address: curve, abi: ponsCurveAbi, functionName: "isNativeQuote" }),
    pub.readContract({ address: curve, abi: ponsCurveAbi, functionName: "token" }),
  ]);
  if (curveToken.toLowerCase() !== token.toLowerCase()) throw new Error(`curve ${curve} is for ${curveToken}, not ${token}`);
  if (graduated) throw new Error(`GRADUATED: curve ${curve} has graduated; liquidity moved to a Uniswap v4 pool and this relay has no v4 source yet. NOT posting; the posted price will go stale and the vault will mark the asset UNAVAILABLE until a v4 source is added.`);
  if (!native) throw new Error(`curve ${curve} is not quoted in native ETH (pairToken ${launch.pairToken}); only native-quote curves are supported`);
  const [[quoteReserve, tokenReserve], totalSupply, decimals, eth] = await Promise.all([
    pub.readContract({ address: curve, abi: ponsCurveAbi, functionName: "getReserves" }),
    pub.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
    pub.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    ethUsd1e18(),
  ]);
  const priceEth = curvePriceEth1e18(quoteReserve, tokenReserve);
  const priceUsd1e18 = ethToUsd1e18(priceEth, eth);
  const sanity = priceSanity({ priceUsd1e18, totalSupply, decimals });
  const detail = `$${Number(priceUsd1e18) / 1e18} (pons-curve ${curve}: ${(Number(quoteReserve) / 1e18).toFixed(4)} ETH / ${(Number(tokenReserve) / 10 ** decimals / 1e6).toFixed(2)}M tokens = ${Number(priceEth) / 1e18} ETH; ETH $${Number(eth) / 1e18}; FDV ${fmtUsd(sanity.fdvUsd1e18)})`;
  if (!sanity.ok) throw new Error(`refusing to post: ${sanity.reason} [${detail}]`);
  return { priceUsd1e18, updatedAt: Math.floor(Date.now() / 1000), detail };
}

const fetchQuote = (asset: RelayAsset) => (asset.source === "pons-curve" ? fetchPonsCurve(asset) : fetchCoingecko(asset.address));

async function tick() {
  const batch: Array<{ a: `0x${string}`; p: bigint; t: bigint; detail: string; symbol: string; source: string }> = [];
  for (const asset of assets) {
    try {
      const q = await fetchQuote(asset);
      const p = q.priceUsd1e18;
      if (p <= 0n) throw new Error("zero price");
      if (oracle) {
        const [prev] = await pub.readContract({ address: oracle, abi, functionName: "getPrice", args: [getAddress(asset.address)] });
        if (prev > 0n) {
          const diff = p > prev ? p - prev : prev - p;
          if (diff * 10_000n > prev * BigInt(maxDev)) {
            console.error(`[${asset.symbol}] move ${(Number(diff * 10_000n / prev) / 100).toFixed(1)}% exceeds ${maxDev / 100}% cap; skipping. ADMIN must forcePrice to acknowledge.`);
            continue;
          }
        }
      }
      batch.push({ a: getAddress(asset.address), p, t: BigInt(Math.min(q.updatedAt, Math.floor(Date.now() / 1000))), detail: q.detail, symbol: asset.symbol, source: asset.source });
    } catch (e) {
      console.error(`[${asset.symbol}] (${asset.source}) fetch failed:`, (e as Error).message);
    }
    if (asset.source === "coingecko") await new Promise((r) => setTimeout(r, 1200)); // free-tier pacing
  }
  if (!batch.length) return;
  console.log(new Date().toISOString(), batch.map((b) => `${b.symbol}=${b.detail}`).join("  "));
  if (dry || !oracle) {
    console.log(dry ? "dry run: not posting" : "ORACLE_ADDRESS unset: not posting");
    return;
  }
  const pk = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("OPERATOR_PRIVATE_KEY missing or malformed (keystore decrypt failed?) — not posting");
  const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(rpc) });
  const hash = await wallet.writeContract({ address: oracle, abi, functionName: "postPrices", args: [batch.map((b) => b.a), batch.map((b) => b.p), batch.map((b) => b.t)] });
  console.log("posted", hash, batch.map((b) => `${b.symbol}(${b.source})`).join(" "));
  await pub.waitForTransactionReceipt({ hash });
}

await tick();
if (!once) {
  const every = Number(process.env.INTERVAL_SEC ?? 300) * 1000;
  setInterval(() => tick().catch((e) => console.error(e)), every);
}
