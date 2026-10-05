/**
 * Pure arithmetic for the reward-inventory conversion (no I/O, unit-tested).
 *
 * The treasury keeps the reward-inventory share of every deposit as ETH. Converting it means:
 * split that ETH across the reward assets by weight, swap each slice for the asset, and fund
 * the vault. Everything here is integer maths on wei so the script and the tests agree exactly.
 */

export interface Weighted {
  symbol: string;
  /** Relative weight; any positive integers (e.g. 50, 25, 25). */
  weight: number;
}

/** Split `totalWei` by weight; the remainder of integer division goes to the heaviest slice so the sum is exact. */
export function splitByWeight(totalWei: bigint, assets: readonly Weighted[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const weights = assets.map((a) => {
    if (!Number.isFinite(a.weight) || a.weight < 0) throw new Error(`weight for ${a.symbol} must be a non-negative number`);
    return BigInt(Math.round(a.weight));
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0n);
  if (totalWeight === 0n) throw new Error("all weights are zero");
  let assigned = 0n;
  assets.forEach((a, i) => {
    const slice = (totalWei * weights[i]) / totalWeight;
    out.set(a.symbol, slice);
    assigned += slice;
  });
  const heaviest = assets.reduce((best, a, i) => (weights[i] > weights[best] ? i : best), 0);
  out.set(assets[heaviest].symbol, (out.get(assets[heaviest].symbol) ?? 0n) + (totalWei - assigned));
  return out;
}

/** Minimum acceptable output after `slippageBps` (e.g. 100 = 1%). */
export function minOut(quotedOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) throw new Error("slippageBps out of range");
  return (quotedOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/**
 * Expected token amount for `amountInWei` of ETH, from an ETH/USD reference and the asset's
 * posted USD price (both 1e18 fixed). Used as an independent sanity bound on the pool quote.
 */
export function expectedOut(amountInWei: bigint, ethUsd1e18: bigint, assetUsd1e18: bigint, assetDecimals: number): bigint {
  if (assetUsd1e18 <= 0n) throw new Error("asset price must be positive");
  // amountIn (1e18) * ethUsd (1e18) / assetUsd (1e18) = tokens in 1e18; rescale to the asset's decimals.
  const tokens1e18 = (amountInWei * ethUsd1e18) / assetUsd1e18;
  return assetDecimals === 18 ? tokens1e18 : assetDecimals > 18 ? tokens1e18 * 10n ** BigInt(assetDecimals - 18) : tokens1e18 / 10n ** BigInt(18 - assetDecimals);
}

/** True when the pool quote is at least (1 - maxDeviationBps) of the oracle-implied amount. */
export function quoteWithinBound(quotedOut: bigint, expected: bigint, maxDeviationBps: number): boolean {
  if (expected <= 0n) return false;
  return quotedOut * 10_000n >= expected * BigInt(10_000 - maxDeviationBps);
}

export function bpsDiff(quotedOut: bigint, expected: bigint): number {
  if (expected === 0n) return 0;
  return Number(((quotedOut - expected) * 10_000n) / expected);
}

/** Parse "CASHCAT=50,PONS=25,AI=25" into weights for the given symbols (missing symbols get 0). */
export function parseWeights(spec: string | undefined, symbols: readonly string[], fallback: number): Weighted[] {
  if (!spec) return symbols.map((symbol) => ({ symbol, weight: fallback }));
  const map = new Map<string, number>();
  for (const part of spec.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (!k) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`bad weight "${part}"`);
    map.set(k.toUpperCase(), n);
  }
  for (const k of map.keys()) if (!symbols.includes(k)) throw new Error(`unknown asset in WEIGHTS: ${k}`);
  return symbols.map((symbol) => ({ symbol, weight: map.get(symbol) ?? 0 }));
}

// ---------------------------------------------------------------------------------------------
// Fulfilment sizing: what to buy so the vault can pay the win balances players already hold.
//
// A win balance is USD at the chip peg (chipUsdValue per unit). Its backing is ETH: converting
// a chip moves chipPriceWei into the treasury's `claimable` earmark, and 20% of the original
// deposit sits in `rewardInventory`. The fulfilment run draws both buckets, buys the shortfall
// first, and only then spreads what is left by WEIGHTS.
// ---------------------------------------------------------------------------------------------

const E18 = 10n ** 18n;

export interface AssetPosition {
  symbol: string;
  /** Posted oracle price, USD 1e18. */
  priceUsd1e18: bigint;
  /** Vault inventory, token base units. */
  inventory: bigint;
  decimals: number;
}

/** USD (1e18) value of `amount` base units at `priceUsd1e18`. */
export function tokenValueUsd(amount: bigint, priceUsd1e18: bigint, decimals: number): bigint {
  if (amount <= 0n || priceUsd1e18 <= 0n) return 0n;
  return (amount * priceUsd1e18) / 10n ** BigInt(decimals);
}

/** ETH (wei) worth `usd1e18` at `ethUsd1e18`, rounded up so a buy sized from it is not a wei short. */
export function usdToWei(usd1e18: bigint, ethUsd1e18: bigint): bigint {
  if (ethUsd1e18 <= 0n) throw new Error("ETH/USD must be positive");
  if (usd1e18 <= 0n) return 0n;
  return (usd1e18 * E18 + ethUsd1e18 - 1n) / ethUsd1e18;
}

/** USD (1e18) worth of `wei` at `ethUsd1e18`. */
export function weiToUsd(wei: bigint, ethUsd1e18: bigint): bigint {
  return wei <= 0n ? 0n : (wei * ethUsd1e18) / E18;
}

/**
 * Per-asset shortfall in USD (1e18). Target per asset = totalWinBalance ÷ number of assets
 * (the enabled assets being bought), minus what the vault already holds of it at the oracle
 * price, floored at 0. An asset the vault is long on does not offset another's shortfall:
 * a player can claim their whole balance as any one asset.
 */
export function shortfallsUsd(totalWinBalanceUsd1e18: bigint, assets: readonly AssetPosition[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (!assets.length) return out;
  const target = totalWinBalanceUsd1e18 > 0n ? totalWinBalanceUsd1e18 / BigInt(assets.length) : 0n;
  for (const a of assets) {
    const held = tokenValueUsd(a.inventory, a.priceUsd1e18, a.decimals);
    out.set(a.symbol, target > held ? target - held : 0n);
  }
  return out;
}

/** Shortfalls in wei at `ethUsd1e18`, grossed up by `bufferBps` (the swap's slippage tolerance) so the fill still covers at the minimum output. */
export function shortfallsWei(shortUsd: ReadonlyMap<string, bigint>, ethUsd1e18: bigint, bufferBps = 0): Map<string, bigint> {
  if (bufferBps < 0 || bufferBps >= 10_000) throw new Error("bufferBps out of range");
  const out = new Map<string, bigint>();
  for (const [symbol, usd] of shortUsd) {
    const wei = usdToWei(usd, ethUsd1e18);
    out.set(symbol, bufferBps > 0 ? (wei * 10_000n + BigInt(10_000 - bufferBps) - 1n) / BigInt(10_000 - bufferBps) : wei);
  }
  return out;
}

/** Split `total` in proportion to bigint `parts`; the integer remainder goes to the largest part so the sum is exact. */
export function splitProportional(total: bigint, parts: ReadonlyMap<string, bigint>): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const sum = [...parts.values()].reduce((s, v) => s + (v > 0n ? v : 0n), 0n);
  if (sum === 0n || total <= 0n) {
    for (const k of parts.keys()) out.set(k, 0n);
    return out;
  }
  let assigned = 0n;
  let largest: string | null = null;
  for (const [k, v] of parts) {
    const p = v > 0n ? v : 0n;
    const slice = (total * p) / sum;
    out.set(k, slice);
    assigned += slice;
    if (largest === null || p > (parts.get(largest) ?? 0n)) largest = k;
  }
  if (largest !== null) out.set(largest, (out.get(largest) ?? 0n) + (total - assigned));
  return out;
}

export type DrawSource = "claimable" | "inventory" | "both";

export function parseSource(v: string | undefined): DrawSource {
  const s = (v ?? "both").trim().toLowerCase();
  if (s === "claimable" || s === "inventory" || s === "both") return s;
  throw new Error(`SOURCE must be claimable, inventory or both (got "${v}")`);
}

export interface DrawInput {
  source: DrawSource;
  /** CasinoTreasury.claimable: ETH that backed converted chips (owed to players as rewards). */
  claimableWei: bigint;
  /** CasinoTreasury.rewardInventory: the reward share of deposits. */
  inventoryWei: bigint;
  /** Do not draw `claimable` below this. */
  minClaimableWei: bigint;
  /** Do not draw the whole inventory bucket below this (gas and slippage make small speculative buys pointless). */
  minInventoryWei: bigint;
  /** Total ETH needed to cover every shortfall. */
  shortfallWei: bigint;
  /** AMOUNT_WEI: convert at most this much in total (claimable first). */
  capWei?: bigint | null;
}

export interface DrawPlan {
  /** fundRewards amount. */
  claimableWei: bigint;
  /** withdrawRewardInventory amount. */
  inventoryWei: bigint;
  /** True when the inventory draw is only the part of the shortfall `claimable` cannot cover (bucket under its floor). */
  inventoryTopUp: boolean;
  notes: string[];
}

/**
 * How much to draw from each treasury bucket.
 *  - claimable: all of it once it reaches its floor (it is owed to players).
 *  - inventory: all of it once it reaches its floor; below the floor, only what is still
 *    needed to cover win balances after the claimable draw (a top-up), never a speculative buy.
 *  - AMOUNT_WEI caps the total, taking claimable first.
 */
export function planDraws(i: DrawInput): DrawPlan {
  const notes: string[] = [];
  let claimable = 0n;
  let inventory = 0n;
  let inventoryTopUp = false;
  let cap = i.capWei ?? null;
  const take = (want: bigint) => {
    if (cap === null) return want;
    const got = want < cap ? want : cap;
    cap -= got;
    return got;
  };

  if (i.source !== "inventory") {
    if (i.claimableWei === 0n) notes.push("claimable bucket is empty (no chips converted since the last run)");
    else if (i.claimableWei < i.minClaimableWei) notes.push(`claimable bucket ${i.claimableWei} wei is below MIN_CLAIMABLE_WEI ${i.minClaimableWei}; left in the treasury until it grows`);
    else claimable = take(i.claimableWei);
  }
  if (i.source !== "claimable") {
    const uncovered = i.shortfallWei > claimable ? i.shortfallWei - claimable : 0n;
    if (i.inventoryWei === 0n) notes.push("rewardInventory bucket is empty");
    else if (i.inventoryWei >= i.minInventoryWei) inventory = take(i.inventoryWei);
    else if (uncovered > 0n) {
      const topUp = uncovered < i.inventoryWei ? uncovered : i.inventoryWei;
      // A top-up alone must still be worth sending: same floor as a claimable draw, unless it rides along with one.
      if (claimable > 0n || topUp >= i.minClaimableWei) {
        inventory = take(topUp);
        inventoryTopUp = inventory > 0n;
        if (inventoryTopUp) notes.push(`rewardInventory is below MIN_INVENTORY_WEI ${i.minInventoryWei}; drawing only the ${inventory} wei still needed to cover win balances`);
      } else notes.push(`rewardInventory top-up of ${topUp} wei is below MIN_CLAIMABLE_WEI ${i.minClaimableWei}; waiting`);
    } else notes.push(`rewardInventory bucket ${i.inventoryWei} wei is below MIN_INVENTORY_WEI ${i.minInventoryWei} and no win balance needs it`);
  }
  return { claimableWei: claimable, inventoryWei: inventory, inventoryTopUp, notes };
}

export interface Allocation {
  /** ETH for this asset in total. */
  totalWei: bigint;
  /** Part that fills a win-balance shortfall. */
  shortfallWei: bigint;
  /** Part from the weighted split of the remaining budget. */
  weightedWei: bigint;
}

/**
 * Spend `budgetWei` across assets: shortfalls first (pro rata to shortfall when the budget
 * cannot cover them all), then the rest by `weights`, as the conversion always did. Slices
 * under `minSliceWei` are folded into the largest slice instead of being sent as dust swaps.
 * The totals always sum to the budget.
 */
export function allocateBudget(budgetWei: bigint, needWei: ReadonlyMap<string, bigint>, weights: readonly Weighted[], minSliceWei = 0n): Map<string, Allocation> {
  const symbols = weights.map((w) => w.symbol);
  const needs = new Map(symbols.map((s) => [s, needWei.get(s) ?? 0n]));
  const totalNeed = [...needs.values()].reduce((s, v) => s + v, 0n);
  const forShortfall = budgetWei < totalNeed ? budgetWei : totalNeed;
  const short = forShortfall === totalNeed ? needs : splitProportional(forShortfall, needs);
  const rest = budgetWei - forShortfall;
  const anyWeight = weights.some((w) => w.weight > 0);
  const weighted = rest > 0n && anyWeight ? splitByWeight(rest, weights) : new Map(symbols.map((s) => [s, 0n]));
  const out = new Map<string, Allocation>();
  for (const s of symbols) {
    const shortfallWei = short.get(s) ?? 0n;
    const weightedWei = weighted.get(s) ?? 0n;
    out.set(s, { totalWei: shortfallWei + weightedWei, shortfallWei, weightedWei });
  }
  if (minSliceWei > 0n && out.size > 1) {
    const largest = [...out.entries()].reduce((b, e) => (e[1].totalWei > b[1].totalWei ? e : b));
    for (const [s, a] of out) {
      if (s === largest[0] || a.totalWei === 0n || a.totalWei >= minSliceWei) continue;
      largest[1].totalWei += a.totalWei;
      largest[1].shortfallWei += a.shortfallWei;
      largest[1].weightedWei += a.weightedWei;
      out.set(s, { totalWei: 0n, shortfallWei: 0n, weightedWei: 0n });
    }
  }
  return out;
}

export interface CoverageInput {
  /** Σ vault inventory × oracle price, USD 1e18. */
  vaultInventoryUsd1e18: bigint;
  claimableWei: bigint;
  rewardInventoryWei: bigint;
  ethUsd1e18: bigint;
  totalWinBalanceUsd1e18: bigint;
}

/**
 * Coverage of outstanding win balances, in bps (10_000 = 100%):
 *   (vault inventory value + claimable ETH value + rewardInventory ETH value) ÷ totalWinBalance.
 * null when nothing is owed.
 */
export function coverageBps(i: CoverageInput): number | null {
  if (i.totalWinBalanceUsd1e18 <= 0n) return null;
  const assets = i.vaultInventoryUsd1e18 + weiToUsd(i.claimableWei, i.ethUsd1e18) + weiToUsd(i.rewardInventoryWei, i.ethUsd1e18);
  return Number((assets * 10_000n) / i.totalWinBalanceUsd1e18);
}

/**
 * ETH/USD (1e18) at which one converted chip is exactly covered.
 *   claimable only:            chipUsdValue ÷ chipPriceWei
 *   with the deposit's reward share: chipUsdValue ÷ (chipPriceWei × (1 + rewardInventoryBps ÷ payoutLiquidityBps))
 * A deposit of D mints D × payoutLiquidityBps ÷ chipPriceWei chips and puts D × rewardInventoryBps into
 * rewardInventory, so each chip arrives with chipPriceWei × rewardInventoryBps ÷ payoutLiquidityBps of it.
 */
export function breakEvenEthUsd1e18(chipPriceWei: bigint, chipUsdValue: bigint, payoutLiquidityBps = 0, rewardInventoryBps = 0): bigint {
  if (chipPriceWei <= 0n) throw new Error("chipPriceWei must be positive");
  const backingNum = chipPriceWei * BigInt(payoutLiquidityBps + rewardInventoryBps);
  if (payoutLiquidityBps <= 0 || rewardInventoryBps <= 0) return (chipUsdValue * E18) / chipPriceWei;
  return (chipUsdValue * E18 * BigInt(payoutLiquidityBps)) / backingNum;
}
