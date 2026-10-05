import type { Hex } from "viem";
import type { Phase } from "@/store/game";
import type { RoundCommitment, RoundReveal } from "@/lib/fairness/commit-reveal";
import { verifyRound } from "@/lib/fairness/commit-reveal";
import type { TreasurySnapshot } from "@/lib/risk/engine";
import { RANDOMNESS_STATUS, ROUND_STATUS, type ChainRoundStatus } from "./contracts";

/**
 * Pure chain → game-store phase mapping. The driver component feeds the latest
 * chain view and the store view in; this returns the ordered list of store
 * transitions to apply. No I/O, so it is unit-tested without a network.
 *
 *   chain Open     → "betting"  (new roundId, slip cleared, commitment shown)
 *   chain Closed   → "closed"   (only bets confirmed on chain survive)
 *   chain Settled  → "spinning" with the chain reveal, then the wheel's onComplete
 *                     runs the existing local settlement ("result")
 *   chain Voided   → "result" (idle), escrow was refunded on chain
 *   no round       → "result" (idle), waiting for the operator
 */
export interface ChainRoundView {
  roundId: bigint | null;
  status: ChainRoundStatus;
  /** Settled result (0..36) or null. */
  result: number | null;
  /** Unix seconds; 0 when unknown. */
  openedAt: number;
}

export interface RandomnessRoundView {
  commitment: Hex;
  playerSeed: Hex;
  serverSeed: Hex;
  blockRef: Hex;
  result: number;
  status: number;
}

export interface StoreRoundView {
  phase: Phase;
  chainRoundId: bigint | null;
}

export type ChainRoundAction =
  | { type: "open"; roundId: bigint; commitment: RoundCommitment | null }
  | { type: "close"; bets: Record<string, number> }
  | { type: "spin"; reveal: RoundReveal }
  | { type: "idle"; roundId: bigint | null; result: number | null };

export interface PlanInput {
  chain: ChainRoundView;
  store: StoreRoundView;
  /** Reveal built from RandomnessManager data for `chain.roundId`, when available. */
  reveal: RoundReveal | null;
  /** Commitment for `chain.roundId`, when available. */
  commitment: RoundCommitment | null;
  /** Bets the player confirmed on chain for `chain.roundId`. */
  submittedBets: Record<string, number>;
}

export function planChainSync({ chain, store, reveal, commitment, submittedBets }: PlanInput): ChainRoundAction[] {
  const { roundId, status } = chain;
  if (roundId == null || status === ROUND_STATUS.None) {
    return store.chainRoundId == null && store.phase === "result" ? [] : [{ type: "idle", roundId: null, result: null }];
  }
  const same = store.chainRoundId === roundId;
  // Never cut a wheel animation short; the next tick re-plans once it lands.
  if (store.phase === "spinning") return [];

  const open: ChainRoundAction = { type: "open", roundId, commitment };
  const close: ChainRoundAction = { type: "close", bets: same ? submittedBets : {} };

  switch (status) {
    case ROUND_STATUS.Open:
      return same ? [] : [open];
    case ROUND_STATUS.Closed:
      if (!same) return [open, close];
      return store.phase === "betting" ? [close] : [];
    case ROUND_STATUS.Settled: {
      if (!same) return [{ type: "idle", roundId, result: chain.result }]; // we did not watch this round: no animation
      if (store.phase === "result") return [];
      if (!reveal) return []; // wait for RandomnessManager data
      return store.phase === "betting" ? [close, { type: "spin", reveal }] : [{ type: "spin", reveal }];
    }
    case ROUND_STATUS.Voided:
      return same && store.phase === "result" ? [] : [{ type: "idle", roundId, result: null }];
    default:
      return [];
  }
}

/** FairnessProof input for an open round: the operator's commitment, player seed once locked. */
export function buildChainCommitment(roundId: bigint, rm: RandomnessRoundView | null, openedAt: number): RoundCommitment | null {
  if (!rm || rm.status === RANDOMNESS_STATUS.None) return null;
  return { roundId: Number(roundId), commitment: rm.commitment, playerSeed: rm.playerSeed, createdAt: openedAt ? openedAt * 1000 : Date.now() };
}

/**
 * Reveal object for a revealed round, verifiable locally with the same math as
 * RandomnessManager.deriveResult (`roundId` is encoded as uint256).
 */
export function buildChainReveal(roundId: bigint, rm: RandomnessRoundView | null, openedAt: number): RoundReveal | null {
  if (!rm || rm.status !== RANDOMNESS_STATUS.Revealed) return null;
  const base = buildChainCommitment(roundId, rm, openedAt);
  if (!base) return null;
  const reveal: RoundReveal = { ...base, serverSeed: rm.serverSeed, blockReference: rm.blockRef, result: rm.result, verified: false };
  reveal.verified = Number.isSafeInteger(Number(roundId)) && verifyRound(reveal);
  return reveal;
}

/** Store phase label for a chain status (used by the driver's status line). */
export function chainStatusLabel(status: ChainRoundStatus, hasRound: boolean): string {
  if (!hasRound) return "Waiting for the operator to open a round";
  switch (status) {
    case ROUND_STATUS.Open:
      return "Bets open on chain";
    case ROUND_STATUS.Closed:
      return "Betting closed · waiting for reveal";
    case ROUND_STATUS.Settled:
      return "Round settled · waiting for the next round";
    case ROUND_STATUS.Voided:
      return "Round voided · stakes refunded to escrow";
    default:
      return "Waiting for the operator to open a round";
  }
}

/** Field-wise equality of two treasury snapshots (the store keeps its own object, so identity is useless). */
export function sameTreasury(a: TreasurySnapshot, b: TreasurySnapshot): boolean {
  return (
    a.bankroll === b.bankroll &&
    a.reservedLiability === b.reservedLiability &&
    a.claimableRewards === b.claimableRewards &&
    a.protocolReserve === b.protocolReserve &&
    a.safetyReserveBps === b.safetyReserveBps &&
    a.maxRoundExposureBps === b.maxRoundExposureBps
  );
}
