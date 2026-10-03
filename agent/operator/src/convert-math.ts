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
