/**
 * Price relay: reads reference USD prices from CoinGecko (platform "robinhood") and
 * posts them to PostedPriceOracle on Robinhood Chain with the OPERATOR key.
 *
 * Env: RPC_URL, ORACLE_ADDRESS, OPERATOR_PRIVATE_KEY (or use --dry-run), CHAIN_ID (4663|46630)
 * Optional: INTERVAL_SEC (default 300), ASSETS (comma list of addresses; default = the three registry assets)
 *
 * Safety: skips an update when the move exceeds MAX_DEVIATION_BPS (default 2000) and
 * logs loudly instead; an ADMIN must acknowledge with forcePrice. Never posts a zero price.
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ASSETS_DEFAULT = [
  { symbol: "CASHCAT", address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4" },
  { symbol: "PONS", address: "0x39dBED3a2bd333467115dE45665cC57F813C4571" },
  { symbol: "AI", address: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18" },
] as const;

const abi = parseAbi([
  "function postPrices(address[] assets, uint256[] prices, uint256[] updatedAts)",
  "function getPrice(address asset) view returns (uint256 priceUsd1e18, uint256 updatedAt)",
  "function maxDeviationBps() view returns (uint16)",
]);

const once = process.argv.includes("--once");
const dry = process.argv.includes("--dry-run");
const rpc = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const chainId = Number(process.env.CHAIN_ID ?? 4663);
const chain = defineChain({ id: chainId, name: chainId === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const oracle = process.env.ORACLE_ADDRESS as `0x${string}` | undefined;
const maxDev = Number(process.env.MAX_DEVIATION_BPS ?? 2000);
const assets = (process.env.ASSETS?.split(",").map((a) => ({ symbol: a.slice(0, 8), address: a.trim() })) ?? ASSETS_DEFAULT) as Array<{ symbol: string; address: string }>;

const pub = createPublicClient({ chain, transport: http(rpc) });

async function fetchPrice(address: string) {
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/robinhood?contract_addresses=${address.toLowerCase()}&vs_currencies=usd&include_last_updated_at=true`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = (await r.json()) as Record<string, { usd?: number; last_updated_at?: number }>;
  const row = j[address.toLowerCase()];
  if (!row?.usd || row.usd <= 0) throw new Error("no price");
  return { usd: row.usd, updatedAt: row.last_updated_at ?? Math.floor(Date.now() / 1000) };
}

async function tick() {
  const batch: Array<{ a: `0x${string}`; p: bigint; t: bigint; usd: number; symbol: string }> = [];
  for (const asset of assets) {
    try {
      const q = await fetchPrice(asset.address);
      const p = parseUnits(q.usd.toFixed(18), 18);
      if (oracle) {
        const [prev] = await pub.readContract({ address: oracle, abi, functionName: "getPrice", args: [asset.address as `0x${string}`] });
        if (prev > 0n) {
          const diff = p > prev ? p - prev : prev - p;
          if (diff * 10_000n > prev * BigInt(maxDev)) {
            console.error(`[${asset.symbol}] move ${(Number(diff * 10_000n / prev) / 100).toFixed(1)}% exceeds ${maxDev / 100}% cap; skipping. ADMIN must forcePrice to acknowledge.`);
            continue;
          }
        }
      }
      batch.push({ a: asset.address as `0x${string}`, p, t: BigInt(Math.min(q.updatedAt, Math.floor(Date.now() / 1000))), usd: q.usd, symbol: asset.symbol });
    } catch (e) {
      console.error(`[${asset.symbol}] fetch failed:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 1200)); // free-tier pacing
  }
  if (!batch.length) return;
  console.log(new Date().toISOString(), batch.map((b) => `${b.symbol}=$${b.usd}`).join("  "));
  if (dry || !oracle) {
    console.log(dry ? "dry run: not posting" : "ORACLE_ADDRESS unset: not posting");
    return;
  }
  const pk = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("OPERATOR_PRIVATE_KEY required to post (or use --dry-run)");
  const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(rpc) });
  const hash = await wallet.writeContract({ address: oracle, abi, functionName: "postPrices", args: [batch.map((b) => b.a), batch.map((b) => b.p), batch.map((b) => b.t)] });
  console.log("posted", hash);
  await pub.waitForTransactionReceipt({ hash });
}

await tick();
if (!once) {
  const every = Number(process.env.INTERVAL_SEC ?? 300) * 1000;
  setInterval(() => tick().catch((e) => console.error(e)), every);
}
