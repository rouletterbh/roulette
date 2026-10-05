/**
 * Reward fulfilment: turns the treasury's reward ETH into reward tokens held by the RewardVault,
 * so the win balances players hold can actually be claimed.
 *
 * Two treasury buckets fund the vault, never the founders:
 *   - `claimable`        ETH that backed chips a player converted to a win balance (convertToRewards).
 *                        It is owed to players as rewards.               → CasinoTreasury.fundRewards
 *   - `rewardInventory`  the 20% share of every deposit.                 → CasinoTreasury.withdrawRewardInventory
 *
 *   1. draw the bucket(s) to the treasurer wallet                        TREASURER_ROLE
 *   2. Uniswap v3 SwapRouter02.exactInputSingle{value}  ETH → asset      (per asset, best fee tier by quote)
 *   3. asset.approve(vault) + RewardVault.fundInventory(asset, amount)   TREASURER_ROLE
 *
 * Sizing: first buy what covers outstanding win balances. Target per asset = totalWinBalance ÷ number of
 * enabled assets, valued at the posted oracle price, minus what the vault already holds, floored at 0.
 * The budget fills those shortfalls first (pro rata when it cannot cover them all), then whatever is left is
 * split by WEIGHTS. Every run logs the coverage ratio
 *   (vault inventory value + claimable ETH value + rewardInventory ETH value) ÷ totalWinBalance
 * and warns below 100%: a win balance is USD at the chip peg while its backing is ETH at the chip price.
 *
 * Default is a DRY RUN that prints the plan with live quotes. Pass --execute to send transactions.
 * The key must hold TREASURER_ROLE (the run refuses otherwise); a dry run needs no key.
 *
 * Env: RPC_URL, CHAIN_ID (4663), TREASURY_ADDRESS, VAULT_ADDRESS, OPERATOR_PRIVATE_KEY (treasurer key; optional for dry run)
 * Optional: SOURCE (both | claimable | inventory; default both), WEIGHTS ("CASHCAT=50,PONS=25,AI=25"; default equal),
 *           AMOUNT_WEI (convert at most this much in total, claimable first; default everything drawable),
 *           MIN_CLAIMABLE_WEI (do not draw `claimable` below this; default 0.0005 ETH),
 *           MIN_INVENTORY_WEI (do not draw the whole `rewardInventory` bucket below this; default 0.004 ETH ≈ $10. Below it,
 *           only the part of a win-balance shortfall that `claimable` cannot cover is drawn),
 *           MIN_SWAP_WEI (slices under this are folded into the largest slice; default 0.00005 ETH),
 *           SLIPPAGE_BPS (100), MAX_DEVIATION_BPS (500: pool quote must be within 5% of the oracle-implied amount, using
 *           CoinGecko ETH/USD), ORACLE_ADDRESS (default: the vault's registered oracle), ROUTER_ADDRESS / QUOTER_ADDRESS /
 *           FACTORY_ADDRESS (defaults: official Uniswap v3 on chain 4663), STATE_DIR (./state), INTERVAL_SEC (300, with --loop)
 * Flags: --execute, --resume (continue a conversion whose swaps did not finish; the drawn ETH is still in the wallet),
 *        --loop (repeat every INTERVAL_SEC; "nothing to do" and failed runs never exit; an unfinished conversion is resumed)
 *
 * Safety: every step is simulated before it is sent; the quoter result is cross-checked against the oracle price so a thin or
 * manipulated pool aborts the run; each draw is written to state/conversions.json BEFORE it is sent, so after a crash
 * `--resume` finishes the swaps from the recorded remaining ETH and never draws a bucket twice.
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  allocateBudget,
  bpsDiff,
  breakEvenEthUsd1e18,
  coverageBps,
  expectedOut,
  minOut,
  parseSource,
  parseWeights,
  planDraws,
  quoteWithinBound,
  shortfallsUsd,
  shortfallsWei,
  splitByWeight,
  splitProportional,
  tokenValueUsd,
  weiToUsd,
} from "./convert-math";

// ------------------------------------------------------------------ config

const execute = process.argv.includes("--execute");
const resumeFlag = process.argv.includes("--resume");
const loop = process.argv.includes("--loop");
const intervalSec = Math.max(30, Number(process.env.INTERVAL_SEC ?? 300));
const rpc = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const chainId = Number(process.env.CHAIN_ID ?? 4663);
const chain = defineChain({
  id: chainId,
  name: chainId === 4663 ? "Robinhood Chain" : chainId === 46630 ? "Robinhood Chain Testnet" : `chain-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});

const ASSETS = [
  { symbol: "CASHCAT", address: getAddress("0x020bfC650A365f8BB26819deAAbF3E21291018b4") },
  { symbol: "PONS", address: getAddress("0x39dBED3a2bd333467115dE45665cC57F813C4571") },
  { symbol: "AI", address: getAddress("0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18") },
] as const;
const SYMBOLS = ASSETS.map((a) => a.symbol);

// Uniswap v3 on Robinhood Chain mainnet (official deployments list, verified by bytecode 2026-10-03).
// WETH9 is read from the router at runtime and must match the configured value.
const UNISWAP_4663 = {
  router: getAddress("0xcaf681a66d020601342297493863e78c959e5cb2"),
  quoter: getAddress("0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7"),
  factory: getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa"),
  weth: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
};
const FEE_TIERS = [500, 3000, 10000] as const;

const treasuryAddress = requireAddress("TREASURY_ADDRESS");
const vaultAddress = requireAddress("VAULT_ADDRESS");
const router = optAddress("ROUTER_ADDRESS") ?? (chainId === 4663 ? UNISWAP_4663.router : undefined);
const quoter = optAddress("QUOTER_ADDRESS") ?? (chainId === 4663 ? UNISWAP_4663.quoter : undefined);
const factory = optAddress("FACTORY_ADDRESS") ?? (chainId === 4663 ? UNISWAP_4663.factory : undefined);
if (!router || !quoter || !factory) throw new Error("ROUTER_ADDRESS, QUOTER_ADDRESS and FACTORY_ADDRESS are required off chain 4663");
const weights = parseWeights(process.env.WEIGHTS, SYMBOLS, 1);
const source = parseSource(process.env.SOURCE);
const minInventoryWei = BigInt(process.env.MIN_INVENTORY_WEI ?? parseUnits("0.004", 18).toString());
// Claimable ETH is owed to players as rewards, so it is drawn at a much lower floor than the inventory bucket.
const minClaimableWei = BigInt(process.env.MIN_CLAIMABLE_WEI ?? parseUnits("0.0005", 18).toString());
const minSwapWei = BigInt(process.env.MIN_SWAP_WEI ?? parseUnits("0.00005", 18).toString());
const amountCap = process.env.AMOUNT_WEI ? BigInt(process.env.AMOUNT_WEI) : null;
const slippageBps = Number(process.env.SLIPPAGE_BPS ?? 100);
const maxDeviationBps = Number(process.env.MAX_DEVIATION_BPS ?? 500);
const stateDir = resolve(process.env.STATE_DIR ?? join(import.meta.dir, "..", "state"));
const recordFile = join(stateDir, "conversions.json");

function requireAddress(name: string): Address {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} must be a 0x address (got ${v ?? "unset"})`);
  return getAddress(v);
}
function optAddress(name: string): Address | undefined {
  const v = process.env[name];
  return v ? getAddress(v) : undefined;
}

// --------------------------------------------------------------------- abis

const treasuryAbi = parseAbi([
  "function rewardInventory() view returns (uint256)",
  "function claimable() view returns (uint256)",
  "function chipPriceWei() view returns (uint256)",
  "function chipUsdValue() view returns (uint256)",
  "function splitConfig() view returns (uint16 payoutLiquidityBps, uint16 rewardInventoryBps, uint16 protocolReserveBps, uint16 platformFeeBps)",
  "function withdrawRewardInventory(address to, uint256 amount)",
  "function fundRewards(address to, uint256 amount)",
  "function ACL() view returns (address)",
]);
const vaultAbi = parseAbi([
  "function assetConfig(address asset) view returns ((bool enabled, uint8 decimals, uint32 maxStaleness, address oracle, uint128 minimumPayoutUsd, uint128 lowWatermark))",
  "function fundInventory(address asset, uint256 amount)",
  "function inventory(address asset) view returns (uint256)",
  "function status(address asset) view returns (uint8)",
  "function totalWinBalance() view returns (uint256)",
]);
const aclAbi = parseAbi(["function TREASURER_ROLE() view returns (bytes32)", "function hasRole(bytes32 role, address account) view returns (bool)"]);
const oracleAbi = parseAbi(["function getPrice(address asset) view returns (uint256 priceUsd1e18, uint256 updatedAt)"]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const routerAbi = parseAbi([
  "function WETH9() view returns (address)",
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const factoryAbi = parseAbi(["function getPool(address a, address b, uint24 fee) view returns (address)"]);

// ------------------------------------------------------------------ clients

const pub = createPublicClient({ chain, transport: http(rpc) });
const pk = process.env.OPERATOR_PRIVATE_KEY as Hex | undefined;
if (execute && (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk))) throw new Error("OPERATOR_PRIVATE_KEY missing or malformed (keystore decrypt failed?) — refusing to execute");
const account = pk && /^0x[0-9a-fA-F]{64}$/.test(pk) ? privateKeyToAccount(pk) : null;
const wallet = account ? createWalletClient({ account, chain, transport: http(rpc) }) : null;

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

// ------------------------------------------------------------------- record

/** One treasury draw. Written with `tx: null` BEFORE it is sent: a recorded draw is never sent again. */
interface Draw {
  source: "claimable" | "inventory";
  /** fundRewards (claimable) or withdrawRewardInventory (inventory). */
  fn: "fundRewards" | "withdrawRewardInventory";
  amountWei: string;
  tx: Hex | null;
}
interface Conversion {
  startedAt: string;
  treasurer: Address;
  /** Total ETH drawn (or being drawn) from the treasury for this conversion. */
  withdrawnWei: string;
  /** Records written before both buckets were supported: the single withdrawRewardInventory tx. */
  withdrawTx: Hex | null;
  /** Per-bucket draws (absent on records written before both buckets were supported). */
  draws?: Draw[];
  /** Planned ETH per asset, so a resumed run spends what the original run sized. */
  plan?: Record<string, string>;
  remainingWei: string;
  swaps: Record<string, { amountInWei: string; amountOut: string; fee: number; swapTx: Hex; fundTx: Hex | null }>;
  done: boolean;
}
interface Record_ { version: 1; conversions: Conversion[] }
function loadRecord(): Record_ {
  if (!existsSync(recordFile)) return { version: 1, conversions: [] };
  return JSON.parse(readFileSync(recordFile, "utf8")) as Record_;
}
function saveRecord(r: Record_) {
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${recordFile}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(r, null, 2));
  renameSync(tmp, recordFile);
}

// ------------------------------------------------------------------- quotes

async function ethUsd1e18(): Promise<bigint> {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = (await r.json()) as { ethereum?: { usd?: number } };
  const usd = j.ethereum?.usd;
  if (!usd || usd <= 0) throw new Error("no ETH/USD price");
  return parseUnits(usd.toFixed(8), 18);
}

async function bestQuote(weth: Address, token: Address, amountIn: bigint) {
  let best: { fee: number; out: bigint; pool: Address } | null = null;
  for (const fee of FEE_TIERS) {
    const pool = await pub.readContract({ address: factory, abi: factoryAbi, functionName: "getPool", args: [weth, token, fee] });
    if (pool === "0x0000000000000000000000000000000000000000") continue;
    try {
      const { result } = await pub.simulateContract({ address: quoter, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn: weth, tokenOut: token, amountIn, fee, sqrtPriceLimitX96: 0n }] });
      const out = result[0];
      if (out > 0n && (!best || out > best.out)) best = { fee, out, pool };
    } catch {
      /* uninitialised or empty pool: skip */
    }
  }
  return best;
}

// --------------------------------------------------------------------- main

type RunResult = "nothing-to-do" | "dry-run" | "done";
const ZERO = "0x0000000000000000000000000000000000000000";
const usd = (v: bigint) => Number(formatUnits(v, 18)).toFixed(4);
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/** One-time checks. Fatal even with --loop: a wrong chain, router or key must stop the service, not be retried. */
async function preflight(): Promise<{ weth: Address }> {
  const rpcChainId = await pub.getChainId();
  if (rpcChainId !== chainId) throw new Error(`CHAIN_ID=${chainId} but RPC reports chain ${rpcChainId}`);
  const weth = await pub.readContract({ address: router, abi: routerAbi, functionName: "WETH9" });
  if (chainId === 4663 && weth.toLowerCase() !== UNISWAP_4663.weth.toLowerCase()) throw new Error(`router WETH9 ${weth} != expected ${UNISWAP_4663.weth}`);

  const acl = await pub.readContract({ address: treasuryAddress, abi: treasuryAbi, functionName: "ACL" });
  const treasurerRole = await pub.readContract({ address: acl, abi: aclAbi, functionName: "TREASURER_ROLE" });
  const needs = "TREASURER_ROLE: fundRewards, withdrawRewardInventory and RewardVault.fundInventory are treasurer-only";
  if (!account) {
    log("role", { needs, accessController: acl, key: null, note: "no OPERATOR_PRIVATE_KEY: dry run only. --execute needs a key that holds TREASURER_ROLE (not the hosted OPERATOR_ROLE hot key)." });
    return { weth };
  }
  const holds = await pub.readContract({ address: acl, abi: aclAbi, functionName: "hasRole", args: [treasurerRole, account.address] });
  log("role", { needs, accessController: acl, key: account.address, holdsTreasurerRole: holds });
  if (!holds) throw new Error(`${account.address} does not hold TREASURER_ROLE on ${acl}; refusing to run. Grant the role to this key or use the treasurer key.`);
  return { weth };
}

async function runOnce(weth: Address): Promise<RunResult> {
  // Which assets are registered, and which oracle prices them.
  const assets: Array<{ symbol: string; address: Address; decimals: number; oracle: Address; weight: number; priceUsd: bigint; priceUpdatedAt: bigint; inventory: bigint }> = [];
  for (const a of ASSETS) {
    const cfg = await pub.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "assetConfig", args: [a.address] });
    const w = weights.find((x) => x.symbol === a.symbol)!.weight;
    if (cfg.oracle === ZERO || !cfg.enabled) {
      log("asset.skipped", { symbol: a.symbol, reason: cfg.enabled ? "not registered on the vault" : "disabled on the vault" });
      continue;
    }
    if (w === 0) {
      log("asset.skipped", { symbol: a.symbol, reason: "weight 0" });
      continue;
    }
    const oracle = optAddress("ORACLE_ADDRESS") ?? cfg.oracle;
    const [decimals, [priceUsd, priceUpdatedAt], inventory] = await Promise.all([
      pub.readContract({ address: a.address, abi: erc20Abi, functionName: "decimals" }),
      pub.readContract({ address: oracle, abi: oracleAbi, functionName: "getPrice", args: [a.address] }),
      pub.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "inventory", args: [a.address] }),
    ]);
    if (priceUsd === 0n) throw new Error(`${a.symbol}: oracle has no price; run the relay first`);
    assets.push({ ...a, decimals, oracle, weight: w, priceUsd, priceUpdatedAt, inventory });
  }
  if (!assets.length) throw new Error("no registered assets with a positive weight");

  // Treasury buckets, what is owed, and the peg.
  const t = { address: treasuryAddress, abi: treasuryAbi } as const;
  const [bucket, claimable, chipPriceWei, chipUsdValue, split, totalWin] = await Promise.all([
    pub.readContract({ ...t, functionName: "rewardInventory" }),
    pub.readContract({ ...t, functionName: "claimable" }),
    pub.readContract({ ...t, functionName: "chipPriceWei" }),
    pub.readContract({ ...t, functionName: "chipUsdValue" }),
    pub.readContract({ ...t, functionName: "splitConfig" }),
    pub.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "totalWinBalance" }),
  ]);
  const eth = await ethUsd1e18();

  // Coverage of outstanding win balances. Never hidden: USD liabilities at the chip peg, ETH backing at the chip price.
  const positions = assets.map((a) => ({ symbol: a.symbol, priceUsd1e18: a.priceUsd, inventory: a.inventory, decimals: a.decimals }));
  const vaultUsd = positions.reduce((s, p) => s + tokenValueUsd(p.inventory, p.priceUsd1e18, p.decimals), 0n);
  const cover = coverageBps({ vaultInventoryUsd1e18: vaultUsd, claimableWei: claimable, rewardInventoryWei: bucket, ethUsd1e18: eth, totalWinBalanceUsd1e18: totalWin });
  const [liqBps, rewBps] = [split[0], split[1]];
  const perChipBps = chipUsdValue > 0n ? Number((chipPriceWei * eth * 10_000n) / (chipUsdValue * 10n ** 18n)) : 0;
  log("peg", {
    chipUsdValue: usd(chipUsdValue),
    chipPriceEth: formatEther(chipPriceWei),
    ethUsd: formatUnits(eth, 18),
    claimableBackingPerChipUsd: usd(weiToUsd(chipPriceWei, eth)),
    claimableCoversPerConvertedChip: pct(perChipBps),
    breakEvenEthUsdClaimableOnly: usd(breakEvenEthUsd1e18(chipPriceWei, chipUsdValue)),
    breakEvenEthUsdWithDepositShare: usd(breakEvenEthUsd1e18(chipPriceWei, chipUsdValue, liqBps, rewBps)),
    depositSplit: { payoutLiquidityBps: liqBps, rewardInventoryBps: rewBps },
    note: "a win balance is USD at the chip peg; its backing is chipPriceWei of ETH in `claimable` plus the deposit's rewardInventory share",
  });
  log("coverage", {
    formula: "(vault inventory value + claimable ETH value + rewardInventory ETH value) / totalWinBalance",
    totalWinBalanceUsd: usd(totalWin),
    vaultInventoryUsd: usd(vaultUsd),
    claimableEth: formatEther(claimable),
    claimableUsd: usd(weiToUsd(claimable, eth)),
    rewardInventoryEth: formatEther(bucket),
    rewardInventoryUsd: usd(weiToUsd(bucket, eth)),
    ratio: cover === null ? "n/a (no outstanding win balances)" : pct(cover),
    ratioBps: cover,
  });
  if (cover !== null && cover < 10_000) {
    const gap = totalWin - (vaultUsd + weiToUsd(claimable, eth) + weiToUsd(bucket, eth));
    log("coverage.WARNING", { ratio: pct(cover), uncoveredUsd: usd(gap), note: "outstanding win balances exceed the vault inventory plus both reward buckets at the current ETH price; the shortfall has to come from deposits' reward share or the treasurer" });
  }

  // Shortfall per asset: target = totalWinBalance / assets, less what the vault holds, floored at 0.
  const shortUsd = shortfallsUsd(totalWin, positions);
  const needWei = shortfallsWei(shortUsd, eth, slippageBps);
  const totalNeed = [...needWei.values()].reduce((s, v) => s + v, 0n);

  // Amount to convert: a resumed record, or fresh draws from the treasury buckets.
  const record = loadRecord();
  let conv = record.conversions.find((c) => !c.done) ?? null;
  const resume = resumeFlag || (loop && !!conv);
  let amount: bigint;
  let slices: Map<string, bigint>;
  const draws: Array<{ source: "claimable" | "inventory"; fn: "fundRewards" | "withdrawRewardInventory"; amount: bigint }> = [];
  if (conv) {
    if (!resume) throw new Error(`an unfinished conversion from ${conv.startedAt} holds ${formatEther(BigInt(conv.remainingWei))} ETH in the wallet; rerun with --resume to finish its swaps`);
    amount = BigInt(conv.remainingWei);
    const unsent = (conv.draws ?? []).filter((d) => !d.tx);
    log("conversion.resume", { startedAt: conv.startedAt, remainingWei: amount, remainingEth: formatEther(amount), drawsWithoutReceipt: unsent.map((d) => `${d.fn} ${formatEther(BigInt(d.amountWei))} ETH`), note: unsent.length ? "a draw was recorded but its receipt was not: it is NOT sent again. If the wallet lacks the ETH, check the treasurer's transactions and the treasury bucket before editing state/conversions.json." : undefined });
    const open = assets.filter((a) => !conv!.swaps[a.symbol]);
    if (conv.plan) {
      const planned = new Map(open.map((a) => [a.symbol, BigInt(conv!.plan![a.symbol] ?? "0")]));
      const plannedTotal = [...planned.values()].reduce((s, v) => s + v, 0n);
      slices = plannedTotal <= amount ? planned : splitProportional(amount, planned);
    } else {
      slices = splitByWeight(amount, assets.map((a) => ({ symbol: a.symbol, weight: a.weight })));
    }
  } else {
    if (resumeFlag && !loop) throw new Error("nothing to resume");
    const d = planDraws({ source, claimableWei: claimable, inventoryWei: bucket, minClaimableWei, minInventoryWei, shortfallWei: totalNeed, capWei: amountCap });
    amount = d.claimableWei + d.inventoryWei;
    log("buckets", {
      source,
      claimableEth: formatEther(claimable),
      rewardInventoryEth: formatEther(bucket),
      drawClaimableEth: formatEther(d.claimableWei),
      drawInventoryEth: formatEther(d.inventoryWei),
      inventoryTopUpOnly: d.inventoryTopUp,
      minClaimableEth: formatEther(minClaimableWei),
      minInventoryEth: formatEther(minInventoryWei),
      shortfallEth: formatEther(totalNeed),
      notes: d.notes,
    });
    if (amount === 0n) {
      log("conversion.nothingToDo", { note: "no bucket is drawable right now; nothing sent", reasons: d.notes });
      return "nothing-to-do";
    }
    if (d.claimableWei > 0n) draws.push({ source: "claimable", fn: "fundRewards", amount: d.claimableWei });
    if (d.inventoryWei > 0n) draws.push({ source: "inventory", fn: "withdrawRewardInventory", amount: d.inventoryWei });
    const alloc = allocateBudget(amount, needWei, assets.map((a) => ({ symbol: a.symbol, weight: a.weight })), minSwapWei);
    slices = new Map([...alloc].map(([k, v]) => [k, v.totalWei]));
    const target = totalWin / BigInt(assets.length);
    for (const a of assets) {
      const al = alloc.get(a.symbol)!;
      log("sizing", {
        symbol: a.symbol,
        targetUsd: usd(target),
        vaultHoldsUsd: usd(tokenValueUsd(a.inventory, a.priceUsd, a.decimals)),
        shortfallUsd: usd(shortUsd.get(a.symbol) ?? 0n),
        shortfallEthWithSlippage: formatEther(needWei.get(a.symbol) ?? 0n),
        forShortfallEth: formatEther(al.shortfallWei),
        byWeightEth: formatEther(al.weightedWei),
        totalEth: formatEther(al.totalWei),
      });
    }
    if (amount < totalNeed) log("sizing.WARNING", { budgetEth: formatEther(amount), shortfallEth: formatEther(totalNeed), note: "the drawable buckets do not cover the win-balance shortfall; it is filled pro rata and the rest stays unclaimable until the buckets grow" });
  }

  // Plan: best pool per asset, oracle cross-check.
  const plan: Array<{ a: (typeof assets)[number]; amountIn: bigint; fee: number; pool: Address; quoted: bigint; min: bigint; expected: bigint; diffBps: number }> = [];
  for (const a of assets) {
    if (conv?.swaps[a.symbol]) {
      log("asset.alreadySwapped", { symbol: a.symbol, ...conv.swaps[a.symbol] });
      continue;
    }
    const amountIn = slices.get(a.symbol) ?? 0n;
    if (amountIn === 0n) continue;
    const q = await bestQuote(weth, a.address, amountIn);
    if (!q) throw new Error(`${a.symbol}: no Uniswap v3 WETH pool with liquidity`);
    const ageSec = Math.floor(Date.now() / 1000) - Number(a.priceUpdatedAt);
    const expected = expectedOut(amountIn, eth, a.priceUsd, a.decimals);
    const diff = bpsDiff(q.out, expected);
    if (!quoteWithinBound(q.out, expected, maxDeviationBps)) {
      throw new Error(`${a.symbol}: pool quote ${formatUnits(q.out, a.decimals)} is ${(diff / 100).toFixed(2)}% vs oracle-implied ${formatUnits(expected, a.decimals)} (limit -${maxDeviationBps / 100}%); aborting`);
    }
    plan.push({ a, amountIn, fee: q.fee, pool: q.pool, quoted: q.out, min: minOut(q.out, slippageBps), expected, diffBps: diff });
    log("plan.asset", {
      symbol: a.symbol,
      amountInEth: formatEther(amountIn),
      pool: q.pool,
      fee: q.fee,
      quoted: formatUnits(q.out, a.decimals),
      minOut: formatUnits(minOut(q.out, slippageBps), a.decimals),
      oracleUsd: formatUnits(a.priceUsd, 18),
      oracleAgeSec: ageSec,
      vsOracleBps: diff,
    });
  }
  log("plan", { ethUsd: formatUnits(eth, 18), totalEth: formatEther(amount), draws: draws.map((d) => `${d.fn}(${formatEther(d.amount)} ETH)`), assets: plan.length, slippageBps, maxDeviationBps, execute });
  if (!execute) {
    console.log("dry run: nothing sent. Re-run with --execute (and a key that holds TREASURER_ROLE) to draw, swap and fund.");
    return "dry-run";
  }
  if (!wallet || !account) throw new Error("wallet unavailable");

  // 1. draw the buckets (unless resuming). Every draw is simulated before anything is recorded or sent.
  if (!conv) {
    const sims = [];
    for (const d of draws) sims.push(await pub.simulateContract({ account, address: treasuryAddress, abi: treasuryAbi, functionName: d.fn, args: [account.address, d.amount] }));
    conv = { startedAt: new Date().toISOString(), treasurer: account.address, withdrawnWei: "0", withdrawTx: null, draws: [], plan: Object.fromEntries([...slices].map(([k, v]) => [k, v.toString()])), remainingWei: "0", swaps: {}, done: false };
    record.conversions.push(conv);
    for (const [i, d] of draws.entries()) {
      const entry: Draw = { source: d.source, fn: d.fn, amountWei: d.amount.toString(), tx: null };
      conv.draws!.push(entry);
      conv.withdrawnWei = (BigInt(conv.withdrawnWei) + d.amount).toString();
      conv.remainingWei = (BigInt(conv.remainingWei) + d.amount).toString();
      saveRecord(record); // persisted BEFORE sending so a crash is resumable and the draw is never repeated
      const hash = await wallet.writeContract(sims[i]!.request);
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error(`${d.fn} reverted: ${hash}`);
      entry.tx = hash;
      saveRecord(record);
      log("drawn", { bucket: d.source, fn: d.fn, amountEth: formatEther(d.amount), tx: hash, block: rc.blockNumber });
    }
  }

  // 2 + 3. swap and fund, one asset at a time
  for (const p of plan) {
    const walletEth = await pub.getBalance({ address: account.address });
    if (walletEth < p.amountIn + parseUnits("0.0005", 18)) throw new Error(`wallet ETH ${formatEther(walletEth)} cannot cover ${formatEther(p.amountIn)} + gas`);
    const before = await pub.readContract({ address: p.a.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    const swapSim = await pub.simulateContract({
      account,
      address: router,
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn: weth, tokenOut: p.a.address, fee: p.fee, recipient: account.address, amountIn: p.amountIn, amountOutMinimum: p.min, sqrtPriceLimitX96: 0n }],
      value: p.amountIn,
    });
    const swapTx = await wallet.writeContract(swapSim.request);
    const swapRc = await pub.waitForTransactionReceipt({ hash: swapTx });
    if (swapRc.status !== "success") throw new Error(`${p.a.symbol}: swap reverted ${swapTx}`);
    const after = await pub.readContract({ address: p.a.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    const received = after - before;
    conv.remainingWei = (BigInt(conv.remainingWei) - p.amountIn).toString();
    conv.swaps[p.a.symbol] = { amountInWei: p.amountIn.toString(), amountOut: received.toString(), fee: p.fee, swapTx, fundTx: null };
    saveRecord(record);
    log("swapped", { symbol: p.a.symbol, amountInEth: formatEther(p.amountIn), received: formatUnits(received, p.a.decimals), tx: swapTx, block: swapRc.blockNumber });
    if (received === 0n) throw new Error(`${p.a.symbol}: swap succeeded but balance did not change`);

    const allowance = await pub.readContract({ address: p.a.address, abi: erc20Abi, functionName: "allowance", args: [account.address, vaultAddress] });
    if (allowance < received) {
      const apSim = await pub.simulateContract({ account, address: p.a.address, abi: erc20Abi, functionName: "approve", args: [vaultAddress, received] });
      const apTx = await wallet.writeContract(apSim.request);
      await pub.waitForTransactionReceipt({ hash: apTx });
    }
    const fundSim = await pub.simulateContract({ account, address: vaultAddress, abi: vaultAbi, functionName: "fundInventory", args: [p.a.address, received] });
    const fundTx = await wallet.writeContract(fundSim.request);
    const fundRc = await pub.waitForTransactionReceipt({ hash: fundTx });
    if (fundRc.status !== "success") throw new Error(`${p.a.symbol}: fundInventory reverted ${fundTx}`);
    conv.swaps[p.a.symbol].fundTx = fundTx;
    saveRecord(record);
    const inv = await pub.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "inventory", args: [p.a.address] });
    const st = await pub.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "status", args: [p.a.address] });
    log("funded", { symbol: p.a.symbol, amount: formatUnits(received, p.a.decimals), vaultInventory: formatUnits(inv, p.a.decimals), vaultStatus: ["UNAVAILABLE", "LOW", "AVAILABLE"][st] ?? st, tx: fundTx, block: fundRc.blockNumber });
  }
  conv.done = true;
  saveRecord(record);
  log("conversion.done", { withdrawnEth: formatEther(BigInt(conv.withdrawnWei)), leftoverWei: conv.remainingWei, record: recordFile });
  return "done";
}

const describeError = (e: unknown) => {
  const err = e as { shortMessage?: string; message?: string };
  return err.shortMessage ?? err.message ?? String(e);
};

async function main() {
  const { weth } = await preflight();
  if (!loop) {
    await runOnce(weth);
    return;
  }
  // --loop: a long-running service. "Nothing to do" and a failed run are both just the next tick.
  log("loop.start", { intervalSec, execute, source });
  let stopping = false;
  let wake: (() => void) | null = null;
  const stop = (signal: string) => {
    log("loop.stopping", { signal, note: "finishing the current run, then exiting" });
    stopping = true;
    wake?.();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  while (!stopping) {
    try {
      const result = await runOnce(weth);
      log("loop.tick", { result, nextRunInSec: intervalSec });
    } catch (e) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "conversion.failed", error: describeError(e), retryInSec: intervalSec }));
    }
    if (stopping) break;
    await new Promise<void>((res) => {
      const timer = setTimeout(res, intervalSec * 1000);
      wake = () => {
        clearTimeout(timer);
        res();
      };
    });
    wake = null;
  }
  log("loop.stopped");
}

main().catch((e: unknown) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "conversion.failed", error: describeError(e) }));
  process.exit(1);
});
