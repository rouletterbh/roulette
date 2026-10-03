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
