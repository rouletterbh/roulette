import { describe, it, expect } from "vitest";
import { DEMO_ROUND_COUNT, getDemoRound, getDemoRounds, listDemoRounds, roundStats } from "./rounds";
import { commit, deriveResult, verifyRound } from "@/lib/fairness/commit-reveal";
import { demoTables } from "./data";

describe("demo rounds generator", () => {
  const rounds = getDemoRounds();

  it("produces the configured number of rounds, newest first, with unique ids", () => {
    expect(rounds).toHaveLength(DEMO_ROUND_COUNT);
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i - 1]!.roundId).toBeGreaterThan(rounds[i]!.roundId);
      expect(rounds[i - 1]!.at).toBeGreaterThanOrEqual(rounds[i]!.at);
    }
    expect(new Set(rounds.map((r) => r.roundId)).size).toBe(rounds.length);
  });

  it("every generated round is a real commit-reveal proof", () => {
    for (const r of rounds) {
      expect(r.verified).toBe(true);
      expect(commit(r.serverSeed)).toBe(r.commitment);
      expect(deriveResult(r.serverSeed, r.playerSeed, r.blockRef, r.roundId)).toBe(r.result);
      expect(
        verifyRound({ roundId: r.roundId, commitment: r.commitment, serverSeed: r.serverSeed, playerSeed: r.playerSeed, blockReference: r.blockRef, result: r.result, createdAt: r.at, verified: false }),
      ).toBe(true);
      expect(r.result).toBeGreaterThanOrEqual(0);
      expect(r.result).toBeLessThanOrEqual(36);
    }
  });

  it("is deterministic across calls", () => {
    const again = getDemoRounds();
    expect(again[0]).toEqual(rounds[0]);
    expect(again[again.length - 1]!.serverSeed).toBe(rounds[rounds.length - 1]!.serverSeed);
  });

  it("matches each live table's published recent numbers", () => {
    for (const t of demoTables.filter((x) => x.status === "live")) {
      const latest = listDemoRounds({ table: t.id, limit: t.recent.length }).rounds.map((r) => r.result);
      expect(latest).toEqual(t.recent);
    }
  });

  it("paginates by cursor without overlap", () => {
    const first = listDemoRounds({ limit: 10 });
    expect(first.rounds).toHaveLength(10);
    expect(first.nextCursor).toBe(first.rounds[9]!.roundId);
    const second = listDemoRounds({ limit: 10, cursor: first.nextCursor! });
    expect(second.rounds[0]!.roundId).toBeLessThan(first.nextCursor!);
    expect(new Set([...first.rounds, ...second.rounds].map((r) => r.roundId)).size).toBe(20);
    expect(getDemoRound(first.rounds[3]!.roundId)).toEqual(first.rounds[3]);
    expect(getDemoRound(1)).toBeNull();
  });

  it("stats counts sum to the sampled window", () => {
    const s = roundStats(undefined, 100);
    expect(s.sampled).toBe(100);
    expect(s.color.red + s.color.black + s.color.green).toBe(100);
    expect(s.parity.odd + s.parity.even + s.parity.zero).toBe(100);
    expect(s.pockets.reduce((a, b) => a + b, 0)).toBe(100);
    expect(s.color.green).toBe(s.parity.zero);
  });
});
