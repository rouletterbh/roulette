/**
 * Reward-inventory conversion: turns the treasury's ETH inventory bucket into reward tokens
 * held by the RewardVault. The bucket is the 20% share of every player deposit, so the vault
 * is funded by players, never by the founders.
 *
 *   1. CasinoTreasury.withdrawRewardInventory(treasurer, amount)   TREASURER
 *   2. Uniswap v3 SwapRouter02.exactInputSingle{value}  ETH → asset  (per asset, best fee tier by quote)
 *   3. asset.approve(vault) + RewardVault.fundInventory(asset, amount)   TREASURER
 *
 * Default is a DRY RUN that prints the plan with live quotes. Pass --execute to send transactions.
 *
 * Env: RPC_URL, CHAIN_ID (4663), TREASURY_ADDRESS, VAULT_ADDRESS, OPERATOR_PRIVATE_KEY (treasurer key; optional for dry run)
 * Optional: WEIGHTS ("CASHCAT=50,PONS=25,AI=25"; default equal), AMOUNT_WEI (convert only this much; default the whole bucket),
 *           MIN_INVENTORY_WEI (refuse below this; default 0.004 ETH ≈ $10), SLIPPAGE_BPS (100), MAX_DEVIATION_BPS (500: pool
 *           quote must be within 5% of the oracle-implied amount, using CoinGecko ETH/USD), ORACLE_ADDRESS (default: the vault's
 *           registered oracle), ROUTER_ADDRESS / QUOTER_ADDRESS / FACTORY_ADDRESS (defaults: official Uniswap v3 on chain 4663),
 *           STATE_DIR (./state)
 * Flags: --execute, --resume (continue a conversion whose swaps did not finish; the withdrawn ETH is still in the wallet)
 *
 * Safety: every step is simulated before it is sent; the quoter result is cross-checked against the oracle price so a thin or
 * manipulated pool aborts the run; a crash after withdrawal leaves a record in state/conversions.json and `--resume` finishes
 * the swaps from the recorded remaining ETH instead of withdrawing again.
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
import { bpsDiff, expectedOut, minOut, parseWeights, quoteWithinBound, splitByWeight } from "./convert-math";

// ------------------------------------------------------------------ config

const execute = process.argv.includes("--execute");
const resume = process.argv.includes("--resume");
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
const minInventoryWei = BigInt(process.env.MIN_INVENTORY_WEI ?? parseUnits("0.004", 18).toString());
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
  "function withdrawRewardInventory(address to, uint256 amount)",
  "function ACL() view returns (address)",
]);
const vaultAbi = parseAbi([
  "function assetConfig(address asset) view returns ((bool enabled, uint8 decimals, uint32 maxStaleness, address oracle, uint128 minimumPayoutUsd, uint128 lowWatermark))",
  "function fundInventory(address asset, uint256 amount)",
  "function inventory(address asset) view returns (uint256)",
  "function status(address asset) view returns (uint8)",
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

interface Conversion {
  startedAt: string;
  treasurer: Address;
  withdrawnWei: string;
  withdrawTx: Hex | null;
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

async function main() {
  const rpcChainId = await pub.getChainId();
  if (rpcChainId !== chainId) throw new Error(`CHAIN_ID=${chainId} but RPC reports chain ${rpcChainId}`);
  const weth = await pub.readContract({ address: router, abi: routerAbi, functionName: "WETH9" });
  if (chainId === 4663 && weth.toLowerCase() !== UNISWAP_4663.weth.toLowerCase()) throw new Error(`router WETH9 ${weth} != expected ${UNISWAP_4663.weth}`);

  const acl = await pub.readContract({ address: treasuryAddress, abi: treasuryAbi, functionName: "ACL" });
  const treasurerRole = await pub.readContract({ address: acl, abi: aclAbi, functionName: "TREASURER_ROLE" });
  if (account) {
    const ok = await pub.readContract({ address: acl, abi: aclAbi, functionName: "hasRole", args: [treasurerRole, account.address] });
    if (!ok) throw new Error(`${account.address} does not hold TREASURER_ROLE on ${acl}`);
  }

  // Which assets are registered, and which oracle prices them.
  const assets: Array<{ symbol: string; address: Address; decimals: number; oracle: Address; weight: number }> = [];
  for (const a of ASSETS) {
    const cfg = await pub.readContract({ address: vaultAddress, abi: vaultAbi, functionName: "assetConfig", args: [a.address] });
    const w = weights.find((x) => x.symbol === a.symbol)!.weight;
    if (cfg.oracle === "0x0000000000000000000000000000000000000000" || !cfg.enabled) {
      log("asset.skipped", { symbol: a.symbol, reason: cfg.enabled ? "not registered on the vault" : "disabled on the vault" });
      continue;
    }
    if (w === 0) {
      log("asset.skipped", { symbol: a.symbol, reason: "weight 0" });
      continue;
    }
    const decimals = await pub.readContract({ address: a.address, abi: erc20Abi, functionName: "decimals" });
    assets.push({ ...a, decimals, oracle: optAddress("ORACLE_ADDRESS") ?? cfg.oracle, weight: w });
  }
  if (!assets.length) throw new Error("no registered assets with a positive weight");

  // Amount to convert: a resumed record, or the treasury bucket (capped by AMOUNT_WEI).
  const record = loadRecord();
  let conv = record.conversions.find((c) => !c.done) ?? null;
  const bucket = await pub.readContract({ address: treasuryAddress, abi: treasuryAbi, functionName: "rewardInventory" });
  let amount: bigint;
  if (conv) {
    if (!resume) throw new Error(`an unfinished conversion from ${conv.startedAt} holds ${formatEther(BigInt(conv.remainingWei))} ETH in the wallet; rerun with --resume to finish its swaps`);
    amount = BigInt(conv.remainingWei);
    log("conversion.resume", { startedAt: conv.startedAt, remainingWei: amount, remainingEth: formatEther(amount) });
  } else {
    if (resume) throw new Error("nothing to resume");
    amount = amountCap && amountCap < bucket ? amountCap : bucket;
    log("bucket", { rewardInventoryWei: bucket, rewardInventoryEth: formatEther(bucket), convertingEth: formatEther(amount), minEth: formatEther(minInventoryWei) });
    if (amount < minInventoryWei) {
      log("conversion.tooSmall", { note: `bucket below MIN_INVENTORY_WEI; nothing to do until deposits grow it (${formatEther(minInventoryWei)} ETH)` });
      return;
    }
  }

  // Plan: slices, best pool per asset, oracle cross-check.
  const eth = await ethUsd1e18();
  const slices = splitByWeight(amount, assets.map((a) => ({ symbol: a.symbol, weight: a.weight })));
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
    const [priceUsd, updatedAt] = await pub.readContract({ address: a.oracle, abi: oracleAbi, functionName: "getPrice", args: [a.address] });
    if (priceUsd === 0n) throw new Error(`${a.symbol}: oracle has no price; run the relay first`);
    const ageSec = Math.floor(Date.now() / 1000) - Number(updatedAt);
    const expected = expectedOut(amountIn, eth, priceUsd, a.decimals);
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
      oracleUsd: formatUnits(priceUsd, 18),
      oracleAgeSec: ageSec,
      vsOracleBps: diff,
    });
  }
  log("plan", { ethUsd: formatUnits(eth, 18), totalEth: formatEther(amount), assets: plan.length, slippageBps, maxDeviationBps, execute });
  if (!execute) {
    console.log("dry run: nothing sent. Re-run with --execute to withdraw, swap and fund.");
    return;
  }
  if (!wallet || !account) throw new Error("wallet unavailable");

  // 1. withdraw (unless resuming)
  if (!conv) {
    const sim = await pub.simulateContract({ account, address: treasuryAddress, abi: treasuryAbi, functionName: "withdrawRewardInventory", args: [account.address, amount] });
    conv = { startedAt: new Date().toISOString(), treasurer: account.address, withdrawnWei: amount.toString(), withdrawTx: null, remainingWei: amount.toString(), swaps: {}, done: false };
    record.conversions.push(conv);
    saveRecord(record); // persisted BEFORE sending so a crash is resumable
    const hash = await wallet.writeContract(sim.request);
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`withdrawRewardInventory reverted: ${hash}`);
    conv.withdrawTx = hash;
    saveRecord(record);
    log("withdrawn", { amountEth: formatEther(amount), tx: hash, block: rc.blockNumber });
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
}

main().catch((e: unknown) => {
  const err = e as { shortMessage?: string; message?: string };
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "conversion.failed", error: err.shortMessage ?? err.message ?? String(e) }));
  process.exit(1);
});
