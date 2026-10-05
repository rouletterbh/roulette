import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";
import { deriveResult, type RoundReveal } from "@/lib/fairness/commit-reveal";
import { RANDOMNESS_STATUS, ROUND_STATUS } from "./contracts";
import { buildChainCommitment, buildChainReveal, planChainSync, type RandomnessRoundView, sameTreasury } from "./round-sync";

const serverSeed = toHex(new Uint8Array(32).fill(7));
const playerSeed = toHex(new Uint8Array(32).fill(9));
const blockRef = toHex(new Uint8Array(32).fill(3));
const ROUND = 42n;

function revealedRound(roundId = ROUND): RandomnessRoundView {
  return { commitment: keccak256(serverSeed), playerSeed, serverSeed, blockRef, result: deriveResult(serverSeed, playerSeed, blockRef, Number(roundId)), status: RANDOMNESS_STATUS.Revealed };
}

const reveal = buildChainReveal(ROUND, revealedRound(), 1_700_000_000)!;
const commitment = buildChainCommitment(ROUND, revealedRound(), 1_700_000_000);
const chain = (status: number, roundId: bigint | null = ROUND, result: number | null = null) => ({ roundId, status: status as 0 | 1 | 2 | 3 | 4, result, openedAt: 1_700_000_000 });
const plan = (status: number, phase: "betting" | "closed" | "spinning" | "result", chainRoundId: bigint | null, extra: Partial<Parameters<typeof planChainSync>[0]> = {}) =>
  planChainSync({ chain: chain(status), store: { phase, chainRoundId }, reveal, commitment, submittedBets: { red: 5 }, ...extra });

describe("buildChainReveal", () => {
  it("verifies locally with the contract's derivation (roundId as uint256)", () => {
    expect(reveal.verified).toBe(true);
    expect(reveal.result).toBe(revealedRound().result);
    expect(reveal.roundId).toBe(42);
    expect(reveal.commitment).toBe(keccak256(serverSeed));
  });
  it("is null until the randomness round is revealed", () => {
    expect(buildChainReveal(ROUND, { ...revealedRound(), status: RANDOMNESS_STATUS.Locked }, 0)).toBeNull();
    expect(buildChainReveal(ROUND, null, 0)).toBeNull();
    expect(buildChainCommitment(ROUND, { ...revealedRound(), status: RANDOMNESS_STATUS.None }, 0)).toBeNull();
  });
  it("flags a tampered result as unverified", () => {
    const bad = buildChainReveal(ROUND, { ...revealedRound(), result: (revealedRound().result + 1) % 37 }, 0)!;
    expect(bad.verified).toBe(false);
  });
});

describe("planChainSync", () => {
  it("opens a new round into betting and is idempotent", () => {
    expect(plan(ROUND_STATUS.Open, "result", null)).toEqual([{ type: "open", roundId: ROUND, commitment }]);
    expect(plan(ROUND_STATUS.Open, "betting", ROUND)).toEqual([]);
  });
  it("closes the same round with only the chain-confirmed bets", () => {
    expect(plan(ROUND_STATUS.Closed, "betting", ROUND)).toEqual([{ type: "close", bets: { red: 5 } }]);
    expect(plan(ROUND_STATUS.Closed, "closed", ROUND)).toEqual([]);
  });
  it("joins a closed round late as a spectator (open then close with no bets)", () => {
    expect(plan(ROUND_STATUS.Closed, "result", 41n)).toEqual([
      { type: "open", roundId: ROUND, commitment },
      { type: "close", bets: {} },
    ]);
  });
  it("spins a settled round we watched, waiting for the reveal data", () => {
    expect(plan(ROUND_STATUS.Settled, "closed", ROUND)).toEqual([{ type: "spin", reveal }]);
    expect(plan(ROUND_STATUS.Settled, "closed", ROUND, { reveal: null })).toEqual([]);
    expect(plan(ROUND_STATUS.Settled, "betting", ROUND)).toEqual([{ type: "close", bets: { red: 5 } }, { type: "spin", reveal }]);
    expect(plan(ROUND_STATUS.Settled, "result", ROUND)).toEqual([]);
  });
  it("never interrupts a spinning wheel", () => {
    expect(plan(ROUND_STATUS.Open, "spinning", 41n)).toEqual([]);
    expect(plan(ROUND_STATUS.Settled, "spinning", ROUND)).toEqual([]);
  });
  it("idles (no animation) for a round settled before we arrived", () => {
    expect(planChainSync({ chain: chain(ROUND_STATUS.Settled, ROUND, 17), store: { phase: "betting", chainRoundId: null }, reveal, commitment, submittedBets: {} })).toEqual([{ type: "idle", roundId: ROUND, result: 17 }]);
  });
  it("idles on voided rounds and when no round exists", () => {
    expect(plan(ROUND_STATUS.Voided, "closed", ROUND)).toEqual([{ type: "idle", roundId: ROUND, result: null }]);
    expect(plan(ROUND_STATUS.Voided, "result", ROUND)).toEqual([]);
    expect(planChainSync({ chain: chain(ROUND_STATUS.None, null), store: { phase: "betting", chainRoundId: null }, reveal: null, commitment: null, submittedBets: {} })).toEqual([{ type: "idle", roundId: null, result: null }]);
    expect(planChainSync({ chain: chain(ROUND_STATUS.None, null), store: { phase: "result", chainRoundId: null }, reveal: null, commitment: null, submittedBets: {} })).toEqual([]);
  });
});

describe("RoundReveal shape", () => {
  it("matches the store's reveal type", () => {
    const r: RoundReveal = reveal;
    expect(typeof r.createdAt).toBe("number");
  });
});

describe("sameTreasury", () => {
  const t = { bankroll: 1000, reservedLiability: 0, claimableRewards: 0, protocolReserve: 11, safetyReserveBps: 1500, maxRoundExposureBps: 2500 };
  it("compares by value, not identity", () => {
    expect(sameTreasury(t, { ...t })).toBe(true);
  });
  it("detects the empty placeholder a chain table starts from", () => {
    expect(sameTreasury({ ...t, bankroll: 0, protocolReserve: 0 }, t)).toBe(false);
    expect(sameTreasury({ ...t, reservedLiability: 5 }, t)).toBe(false);
  });
});
