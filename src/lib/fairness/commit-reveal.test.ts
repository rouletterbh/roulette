import { describe, it, expect } from "vitest";
import { createCommitment, reveal, verifyRound, deriveResult, commit } from "./commit-reveal";

describe("commit–reveal", () => {
  it("commits before and verifies after", () => {
    const { commitment, serverSeed } = createCommitment(1);
    expect(commitment.commitment).toBe(commit(serverSeed));
    const r = reveal(commitment, serverSeed);
    expect(r.result).toBeGreaterThanOrEqual(0);
    expect(r.result).toBeLessThanOrEqual(36);
    expect(verifyRound(r)).toBe(true);
  });
  it("rejects a tampered result or seed", () => {
    const { commitment, serverSeed } = createCommitment(2);
    const r = reveal(commitment, serverSeed);
    expect(verifyRound({ ...r, result: (r.result + 1) % 37 })).toBe(false);
    expect(verifyRound({ ...r, serverSeed: `0x${"11".repeat(32)}` })).toBe(false);
  });
  it("is deterministic per round id and differs across rounds", () => {
    const s = `0x${"ab".repeat(32)}` as const;
    const p = `0x${"cd".repeat(32)}` as const;
    const b = `0x${"ef".repeat(32)}` as const;
    expect(deriveResult(s, p, b, 1)).toBe(deriveResult(s, p, b, 1));
    const results = new Set(Array.from({ length: 200 }, (_, i) => deriveResult(s, p, b, i)));
    expect(results.size).toBeGreaterThan(20);
  });
  it("distributes roughly uniformly over 37 pockets", () => {
    const s = `0x${"01".repeat(32)}` as const;
    const p = `0x${"02".repeat(32)}` as const;
    const b = `0x${"03".repeat(32)}` as const;
    const counts = new Array(37).fill(0);
    const N = 37 * 400;
    for (let i = 0; i < N; i++) counts[deriveResult(s, p, b, i)]++;
    const expected = N / 37;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // 36 degrees of freedom; 99.9% critical value ≈ 67.985
    expect(chi2).toBeLessThan(68);
  });
});
