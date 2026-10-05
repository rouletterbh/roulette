import { describe, expect, test } from "bun:test";
import { bpsDiff, expectedOut, minOut, parseWeights, quoteWithinBound, splitByWeight } from "../src/convert-math";

describe("splitByWeight", () => {
  test("splits exactly with remainder on the heaviest slice", () => {
    const m = splitByWeight(1_000_000_000_000_000_001n, [
      { symbol: "A", weight: 50 },
      { symbol: "B", weight: 25 },
      { symbol: "C", weight: 25 },
    ]);
    const sum = [...m.values()].reduce((s, v) => s + v, 0n);
    expect(sum).toBe(1_000_000_000_000_000_001n);
    expect(m.get("A")!).toBeGreaterThan(m.get("B")!);
    expect(m.get("B")).toBe(m.get("C"));
  });
  test("zero-weight assets get nothing; all-zero rejected", () => {
    const m = splitByWeight(100n, [
      { symbol: "A", weight: 1 },
      { symbol: "B", weight: 0 },
    ]);
    expect(m.get("A")).toBe(100n);
    expect(m.get("B")).toBe(0n);
    expect(() => splitByWeight(100n, [{ symbol: "A", weight: 0 }])).toThrow();
  });
});

describe("minOut / bounds", () => {
  test("1% slippage", () => {
    expect(minOut(10_000n, 100)).toBe(9_900n);
    expect(() => minOut(1n, 20_000)).toThrow();
  });
  test("expectedOut from ETH/USD and asset USD", () => {
    // 0.001 ETH at $2,680 = $2.68; at $0.158 per token → ~16.96 tokens
    const out = expectedOut(1_000_000_000_000_000n, 2_680n * 10n ** 18n, 158_000_000_000_000_000n, 18);
    expect(out).toBe(16_962_025_316_455_696_202n);
    // 6-decimal asset
    expect(expectedOut(10n ** 18n, 2n * 10n ** 18n, 10n ** 18n, 6)).toBe(2_000_000n);
  });
  test("quoteWithinBound and bpsDiff", () => {
    expect(quoteWithinBound(950n, 1000n, 500)).toBe(true);
    expect(quoteWithinBound(949n, 1000n, 500)).toBe(false);
    expect(quoteWithinBound(1n, 0n, 500)).toBe(false);
    expect(bpsDiff(950n, 1000n)).toBe(-500);
  });
});

describe("parseWeights", () => {
  const syms = ["CASHCAT", "PONS", "AI"] as const;
  test("defaults to equal weights", () => {
    expect(parseWeights(undefined, syms, 1).map((w) => w.weight)).toEqual([1, 1, 1]);
  });
  test("parses a spec, case-insensitive, missing → 0", () => {
    expect(parseWeights("cashcat=50, PONS=25", syms, 1).map((w) => w.weight)).toEqual([50, 25, 0]);
  });
  test("rejects unknown symbols and bad numbers", () => {
    expect(() => parseWeights("DOGE=1", syms, 1)).toThrow();
    expect(() => parseWeights("PONS=x", syms, 1)).toThrow();
  });
});

// ------------------------------------------------------------------ fulfilment sizing

import { allocateBudget, breakEvenEthUsd1e18, coverageBps, parseSource, planDraws, shortfallsUsd, shortfallsWei, splitProportional, tokenValueUsd, usdToWei, weiToUsd } from "../src/convert-math";

const E18 = 10n ** 18n;
const ETH = 2_670n * E18; // ETH/USD
const CHIP_PRICE = 30_000_000_000_000n; // 0.00003 ETH
const CHIP_USD = E18 / 10n; // $0.10
const eth = (s: string) => BigInt(Math.round(Number(s) * 1e9)) * 10n ** 9n;
const three = (inv: [bigint, bigint, bigint] = [0n, 0n, 0n]) => [
  { symbol: "CASHCAT", priceUsd1e18: 160_000_000_000_000_000n, inventory: inv[0], decimals: 18 },
  { symbol: "PONS", priceUsd1e18: 400_000_000_000_000_000n, inventory: inv[1], decimals: 18 },
  { symbol: "AI", priceUsd1e18: 150_000_000_000_000_000n, inventory: inv[2], decimals: 18 },
];
const equal = [{ symbol: "CASHCAT", weight: 1 }, { symbol: "PONS", weight: 1 }, { symbol: "AI", weight: 1 }];
const sum = (m: Map<string, { totalWei: bigint }>) => [...m.values()].reduce((s, a) => s + a.totalWei, 0n);

describe("shortfalls", () => {
  test("target is totalWinBalance ÷ assets, less what the vault already holds, floored at 0", () => {
    // $6 owed, three assets → $2 each. Vault: 5 CASHCAT ($0.80), 10 PONS ($4), no AI.
    const s = shortfallsUsd(6n * E18, three([5n * E18, 10n * E18, 0n]));
    expect(s.get("CASHCAT")).toBe(1_200_000_000_000_000_000n);
    expect(s.get("PONS")).toBe(0n); // long PONS does not offset the others
    expect(s.get("AI")).toBe(2n * E18);
    expect([...shortfallsUsd(0n, three()).values()]).toEqual([0n, 0n, 0n]);
    expect(shortfallsUsd(E18, []).size).toBe(0);
  });
  test("USD ↔ wei conversions round the buy up and the valuation down", () => {
    expect(usdToWei(2_670n * E18, ETH)).toBe(E18);
    expect(usdToWei(1n, ETH)).toBe(1n); // rounds up
    expect(usdToWei(0n, ETH)).toBe(0n);
    expect(weiToUsd(E18, ETH)).toBe(2_670n * E18);
    expect(tokenValueUsd(250_000_000n, 160_000_000_000_000_000n, 6)).toBe(40n * E18);
    expect(() => usdToWei(E18, 0n)).toThrow();
    const w = shortfallsWei(new Map([["A", 2_670n * E18]]), ETH, 100);
    expect(w.get("A")).toBe((E18 * 10_000n + 9_899n) / 9_900n); // grossed up by 1% slippage
    expect(w.get("A")! * 9_900n >= E18 * 10_000n).toBe(true);
  });
  test("splitProportional is exact and gives the remainder to the largest part", () => {
    const m = splitProportional(100n, new Map([["A", 1n], ["B", 1n], ["C", 1n]]));
    expect([...m.values()].reduce((s, v) => s + v, 0n)).toBe(100n);
    expect(splitProportional(10n, new Map([["A", 3n], ["B", 0n]])).get("A")).toBe(10n);
    expect([...splitProportional(10n, new Map([["A", 0n]])).values()]).toEqual([0n]);
  });
});

describe("planDraws", () => {
  const base = { source: "both" as const, claimableWei: 0n, inventoryWei: 0n, minClaimableWei: eth("0.0005"), minInventoryWei: eth("0.004"), shortfallWei: 0n };
  test("mainnet today: nothing converted, inventory under its floor → nothing to do", () => {
    const p = planDraws({ ...base, inventoryWei: 857_142_857_142_856n });
    expect(p).toMatchObject({ claimableWei: 0n, inventoryWei: 0n, inventoryTopUp: false });
    expect(p.notes.join(" ")).toMatch(/claimable bucket is empty/);
    expect(p.notes.join(" ")).toMatch(/below MIN_INVENTORY_WEI .* and no win balance needs it/);
  });
  test("claimable is drawn in full at its own lower floor; inventory tops up only the uncovered shortfall", () => {
    // 50 chips converted: 0.0015 ETH claimable, $5 owed ≈ 0.001873 ETH at $2,670.
    const need = usdToWei(5n * E18, ETH);
    const p = planDraws({ ...base, claimableWei: eth("0.0015"), inventoryWei: 857_142_857_142_856n, shortfallWei: need });
    expect(p.claimableWei).toBe(eth("0.0015"));
    expect(p.inventoryWei).toBe(need - eth("0.0015"));
    expect(p.inventoryTopUp).toBe(true);
  });
  test("a top-up never exceeds the bucket, and a full bucket above its floor is drawn whole", () => {
    const short = planDraws({ ...base, claimableWei: eth("0.0015"), inventoryWei: 100n, shortfallWei: eth("0.01") });
    expect(short.inventoryWei).toBe(100n);
    const full = planDraws({ ...base, claimableWei: eth("0.0015"), inventoryWei: eth("0.01"), shortfallWei: 0n });
    expect(full).toMatchObject({ claimableWei: eth("0.0015"), inventoryWei: eth("0.01"), inventoryTopUp: false });
  });
  test("claimable under its floor waits; SOURCE restricts the buckets; AMOUNT_WEI caps claimable first", () => {
    expect(planDraws({ ...base, claimableWei: eth("0.0003"), shortfallWei: eth("0.0003") }).claimableWei).toBe(0n);
    // …and a lone inventory top-up that small waits too.
    expect(planDraws({ ...base, claimableWei: eth("0.0003"), inventoryWei: eth("0.001"), shortfallWei: eth("0.0003") })).toMatchObject({ claimableWei: 0n, inventoryWei: 0n });
    const both = { ...base, claimableWei: eth("0.002"), inventoryWei: eth("0.01") };
    expect(planDraws({ ...both, source: "claimable" })).toMatchObject({ claimableWei: eth("0.002"), inventoryWei: 0n });
    expect(planDraws({ ...both, source: "inventory" })).toMatchObject({ claimableWei: 0n, inventoryWei: eth("0.01") });
    expect(planDraws({ ...both, capWei: eth("0.003") })).toMatchObject({ claimableWei: eth("0.002"), inventoryWei: eth("0.001") });
    expect(planDraws({ ...both, capWei: eth("0.001") })).toMatchObject({ claimableWei: eth("0.001"), inventoryWei: 0n });
    expect(parseSource(undefined)).toBe("both");
    expect(parseSource(" Claimable ")).toBe("claimable");
    expect(() => parseSource("treasury")).toThrow();
  });
});

describe("allocateBudget", () => {
  test("shortfalls first, pro rata when the budget cannot cover them", () => {
    const need = new Map([["CASHCAT", 300n], ["PONS", 0n], ["AI", 100n]]);
    const a = allocateBudget(200n, need, equal);
    expect(a.get("CASHCAT")).toEqual({ totalWei: 150n, shortfallWei: 150n, weightedWei: 0n });
    expect(a.get("PONS")!.totalWei).toBe(0n);
    expect(a.get("AI")!.totalWei).toBe(50n);
    expect(sum(a)).toBe(200n);
  });
  test("what is left after the shortfalls is split by WEIGHTS, as before", () => {
    const need = new Map([["CASHCAT", 300n], ["AI", 100n]]);
    const a = allocateBudget(1_000n, need, [{ symbol: "CASHCAT", weight: 50 }, { symbol: "PONS", weight: 25 }, { symbol: "AI", weight: 25 }]);
    expect(a.get("CASHCAT")).toEqual({ totalWei: 600n, shortfallWei: 300n, weightedWei: 300n });
    expect(a.get("PONS")).toEqual({ totalWei: 150n, shortfallWei: 0n, weightedWei: 150n });
    expect(a.get("AI")).toEqual({ totalWei: 250n, shortfallWei: 100n, weightedWei: 150n });
    expect(sum(a)).toBe(1_000n);
    // No win balances: exactly the old weighted split.
    const plain = allocateBudget(1_000_000_000_000_000_001n, new Map(), equal);
    expect([...plain.values()].map((x) => x.totalWei)).toEqual([...splitByWeight(1_000_000_000_000_000_001n, equal).values()]);
  });
  test("dust slices are folded into the largest slice; the total is unchanged", () => {
    const a = allocateBudget(1_000n, new Map([["CASHCAT", 990n], ["AI", 10n]]), equal, 50n);
    expect(a.get("AI")!.totalWei).toBe(0n);
    expect(a.get("CASHCAT")!.totalWei).toBe(1_000n);
    expect(sum(a)).toBe(1_000n);
  });
  test("worked example: 50 chips converted, empty vault, ETH $2,670", () => {
    const assets = three();
    const shortUsd = shortfallsUsd(5n * E18, assets); // $1.6667 each (integer division leaves 2 wei-USD unassigned)
    const need = shortfallsWei(shortUsd, ETH);
    const totalNeed = [...need.values()].reduce((s, v) => s + v, 0n);
    expect(Number(totalNeed) / 1e18).toBeCloseTo(5 / 2670, 9); // 0.0018727 ETH
    const draws = planDraws({ source: "both", claimableWei: 50n * CHIP_PRICE, inventoryWei: 857_142_857_142_856n, minClaimableWei: eth("0.0005"), minInventoryWei: eth("0.004"), shortfallWei: totalNeed });
    expect(draws.claimableWei).toBe(eth("0.0015"));
    expect(draws.inventoryWei).toBe(totalNeed - eth("0.0015")); // 0.0003727 ETH top-up
    const a = allocateBudget(draws.claimableWei + draws.inventoryWei, need, equal);
    for (const s of ["CASHCAT", "PONS", "AI"]) expect(a.get(s)).toEqual({ totalWei: need.get(s)!, shortfallWei: need.get(s)!, weightedWei: 0n });
    expect(sum(a)).toBe(totalNeed);
  });
});

describe("coverage and the peg", () => {
  test("coverage = (vault inventory value + claimable ETH value + rewardInventory ETH value) ÷ totalWinBalance", () => {
    // $5 owed; 0.0015 ETH claimable ($4.005) + 0.000857142857142856 ETH inventory ($2.2886) + empty vault = 125.87%
    expect(coverageBps({ vaultInventoryUsd1e18: 0n, claimableWei: 50n * CHIP_PRICE, rewardInventoryWei: 857_142_857_142_856n, ethUsd1e18: ETH, totalWinBalanceUsd1e18: 5n * E18 })).toBe(12_587);
    // Claimable alone covers 80.1% at $2,670: the peg gap.
    expect(coverageBps({ vaultInventoryUsd1e18: 0n, claimableWei: 50n * CHIP_PRICE, rewardInventoryWei: 0n, ethUsd1e18: ETH, totalWinBalanceUsd1e18: 5n * E18 })).toBe(8_010);
    expect(coverageBps({ vaultInventoryUsd1e18: 5n * E18, claimableWei: 0n, rewardInventoryWei: 0n, ethUsd1e18: ETH, totalWinBalanceUsd1e18: 5n * E18 })).toBe(10_000);
    expect(coverageBps({ vaultInventoryUsd1e18: 0n, claimableWei: E18, rewardInventoryWei: 0n, ethUsd1e18: ETH, totalWinBalanceUsd1e18: 0n })).toBeNull();
  });
  test("break-even ETH price: $3,333.33 on claimable alone, $2,592.59 with the 20% deposit share (70% mints chips)", () => {
    expect(Number(breakEvenEthUsd1e18(CHIP_PRICE, CHIP_USD)) / 1e18).toBeCloseTo(3333.3333, 3);
    expect(Number(breakEvenEthUsd1e18(CHIP_PRICE, CHIP_USD, 7000, 2000)) / 1e18).toBeCloseTo(2592.5926, 3);
    expect(() => breakEvenEthUsd1e18(0n, CHIP_USD)).toThrow();
  });
});
