"use client";

import { create } from "zustand";
import { betFromId, type PlacedBet } from "@/lib/roulette/bets";
import { settleBets, maximumLiability, type Settlement } from "@/lib/roulette/settle";
import { checkWager, getMaximumSafeBet, type TreasurySnapshot } from "@/lib/risk/engine";
import { createCommitment, reveal, type RoundCommitment, type RoundReveal } from "@/lib/fairness/commit-reveal";
import type { Hex } from "viem";
import { sfx } from "@/lib/sound/engine";
import { track, bucketAmount } from "@/lib/analytics/events";

export type GameMode = "practice" | "quick" | "live" | "private";
export type Phase = "betting" | "closed" | "spinning" | "result";

export interface RoundRecord {
  roundId: number;
  result: number;
  settlement: Settlement;
  reveal: RoundReveal;
  at: number;
}

export interface GameState {
  mode: GameMode;
  phase: Phase;
  balance: number;
  selectedChip: number;
  bets: Record<string, number>;
  history: Array<{ betId: string; delta: number }>;
  lastBets: Record<string, number> | null;
  roundId: number;
  commitment: RoundCommitment | null;
  /** Secret until reveal. In production this never leaves the server/contract. */
  _serverSeed: Hex | null;
  pendingReveal: RoundReveal | null;
  /** Live tables: player confirmed their slip for this round. */
  betsLocked: boolean;
  lastRound: RoundRecord | null;
  rounds: RoundRecord[];
  recent: number[];
  treasury: TreasurySnapshot;
  error: string | null;
  stats: { spins: number; wins: number; largestWin: number; streak: number; bestStreak: number; wagered: number };

  init: (mode: GameMode, balance?: number) => void;
  selectChip: (v: number) => void;
  addBet: (betId: string) => void;
  removeBet: (betId: string) => void;
  undo: () => void;
  clear: () => void;
  repeat: () => void;
  double: () => void;
  maxSafe: (betId?: string) => void;
  placeBets: () => void;
  closeRound: () => void;
  onSpinComplete: () => void;
  nextRound: () => void;
  placedBets: () => PlacedBet[];
  totalWager: () => number;
  liability: () => number;
  maxStakeFor: (betId: string) => number;
}

export const PRACTICE_TREASURY: TreasurySnapshot = {
  bankroll: 25_000,
  reservedLiability: 0,
  claimableRewards: 0,
  protocolReserve: 0,
  safetyReserveBps: 1000,
  maxRoundExposureBps: 2500,
};

const toPlaced = (bets: Record<string, number>): PlacedBet[] =>
  Object.entries(bets)
    .filter(([, stake]) => stake > 0)
    .map(([id, stake]) => ({ ...betFromId(id)!, stake }));

function newCommitment(roundId: number) {
  const { commitment, serverSeed } = createCommitment(roundId);
  return { commitment, _serverSeed: serverSeed };
}

export const useGame = create<GameState>()((set, get) => ({
  mode: "practice",
  phase: "betting",
  balance: 1000,
  selectedChip: 5,
  bets: {},
  history: [],
  lastBets: null,
  roundId: 1,
  commitment: null,
  _serverSeed: null,
  pendingReveal: null,
  betsLocked: false,
  lastRound: null,
  rounds: [],
  recent: [],
  treasury: PRACTICE_TREASURY,
  error: null,
  stats: { spins: 0, wins: 0, largestWin: 0, streak: 0, bestStreak: 0, wagered: 0 },

  init: (mode, balance = 1000) => {
    if (mode === "practice") track("practice_start");
    else track("table_join", { mode });
    set({ mode, balance, phase: "betting", bets: {}, history: [], lastBets: null, roundId: 1, rounds: [], recent: [], lastRound: null, pendingReveal: null, betsLocked: false, error: null, treasury: { ...PRACTICE_TREASURY }, stats: { spins: 0, wins: 0, largestWin: 0, streak: 0, bestStreak: 0, wagered: 0 }, ...newCommitment(1) });
  },

  selectChip: (selectedChip) => set({ selectedChip }),

  placedBets: () => toPlaced(get().bets),
  totalWager: () => Object.values(get().bets).reduce((s, v) => s + v, 0),
  liability: () => maximumLiability(toPlaced(get().bets)).maxNetPayout,

  maxStakeFor: (betId) => {
    const def = betFromId(betId);
    if (!def) return 0;
    const others = toPlaced(get().bets).filter((b) => b.id !== betId);
    const existing = maximumLiability(others).maxNetPayout;
    const r = getMaximumSafeBet(get().treasury, def.multiplier, existing);
    return Math.max(0, Math.floor(r.maxStake));
  },

  addBet: (betId) => {
    const s = get();
    if (s.phase !== "betting") return;
    const def = betFromId(betId);
    if (!def) return;
    const stake = s.selectedChip;
    const total = s.totalWager();
    if (total + stake > s.balance) {
      set({ error: "Insufficient chips" });
      return;
    }
    const next = { ...s.bets, [betId]: (s.bets[betId] ?? 0) + stake };
    const check = checkWager(s.treasury, toPlaced(next));
    if (!check.ok) {
      set({ error: "Table limit reached" });
      return;
    }
    sfx.chip();
    set({ bets: next, history: [...s.history, { betId, delta: stake }], error: null, betsLocked: false });
  },

  removeBet: (betId) => {
    const s = get();
    if (s.phase !== "betting") return;
    const { [betId]: removed, ...rest } = s.bets;
    if (!removed) return;
    set({ bets: rest, history: [...s.history, { betId, delta: -removed }], error: null });
  },

  undo: () => {
    const s = get();
    if (s.phase !== "betting" || s.history.length === 0) return;
    const last = s.history[s.history.length - 1];
    const bets = { ...s.bets };
    const v = (bets[last.betId] ?? 0) - last.delta;
    if (v <= 0) delete bets[last.betId];
    else bets[last.betId] = v;
    sfx.undo();
    set({ bets, history: s.history.slice(0, -1), error: null });
  },

  clear: () => {
    if (get().phase !== "betting") return;
    set({ bets: {}, history: [], error: null });
  },

  repeat: () => {
    const s = get();
    if (s.phase !== "betting" || !s.lastBets) return;
    const total = Object.values(s.lastBets).reduce((a, b) => a + b, 0);
    if (total > s.balance) return set({ error: "Insufficient chips" });
    const check = checkWager(s.treasury, toPlaced(s.lastBets));
    if (!check.ok) return set({ error: "Table limit reached" });
    sfx.chip();
    set({ bets: { ...s.lastBets }, history: Object.entries(s.lastBets).map(([betId, delta]) => ({ betId, delta })), error: null });
  },

  double: () => {
    const s = get();
    if (s.phase !== "betting") return;
    const doubled = Object.fromEntries(Object.entries(s.bets).map(([k, v]) => [k, v * 2]));
    const total = Object.values(doubled).reduce((a, b) => a + b, 0);
    if (total > s.balance) return set({ error: "Insufficient chips" });
    const check = checkWager(s.treasury, toPlaced(doubled));
    if (!check.ok) return set({ error: "Table limit reached" });
    sfx.chip();
    set({ bets: doubled, history: [...s.history, ...Object.entries(s.bets).map(([betId, delta]) => ({ betId, delta }))], error: null });
  },

  /** Raise the most recent bet (or given bet) to the maximum stake the treasury can collateralize. */
  maxSafe: (betId) => {
    const s = get();
    if (s.phase !== "betting") return;
    const target = betId ?? s.history[s.history.length - 1]?.betId;
    if (!target) return set({ error: "Place a bet first, then press Max safe" });
    const def = betFromId(target)!;
    const others = toPlaced(s.bets).filter((b) => b.id !== target);
    const existing = maximumLiability(others).maxNetPayout;
    const r = getMaximumSafeBet(s.treasury, def.multiplier, existing);
    const othersTotal = others.reduce((a, b) => a + b.stake, 0);
    const stake = Math.max(0, Math.min(Math.floor(r.maxStake), s.balance - othersTotal));
    if (stake <= 0) return set({ error: "Table limit reached" });
    const current = s.bets[target] ?? 0;
    sfx.chip();
    set({ bets: { ...s.bets, [target]: stake }, history: [...s.history, { betId: target, delta: stake - current }], error: null });
  },

  placeBets: () => {
    const s = get();
    if (s.phase !== "betting") return;
    const placed = toPlaced(s.bets);
    const check = checkWager(s.treasury, placed);
    if (!check.ok) return set({ error: check.reason ?? "Bet rejected" });
    const total = placed.reduce((a, b) => a + b.stake, 0);
    if (total > s.balance) return set({ error: "Insufficient chips" });
    if (s.mode === "live" || s.mode === "private") {
      // At shared tables the timer closes the round; the button only locks the slip.
      set({ betsLocked: true, error: null });
      return;
    }
    get().closeRound();
  },

  /** Closes betting and derives the result from the committed seed BEFORE the wheel animates. */
  closeRound: () => {
    const s = get();
    if (s.phase !== "betting") return;
    if (!s.commitment || !s._serverSeed) return;
    const placed = toPlaced(s.bets);
    const check = checkWager(s.treasury, placed);
    const accepted = placed.length > 0 && check.ok;
    const total = accepted ? placed.reduce((a, b) => a + b.stake, 0) : 0;
    if (accepted && total > s.balance) return set({ error: "Insufficient chips" });
    const pendingReveal = reveal(s.commitment, s._serverSeed);
    sfx.close();
    if (accepted) track("bet_submit", { mode: s.mode, bets: placed.length, amount: bucketAmount(total) });
    set({
      phase: "closed",
      bets: accepted ? s.bets : {},
      balance: s.balance - total,
      lastBets: accepted ? { ...s.bets } : s.lastBets,
      pendingReveal,
      betsLocked: false,
      error: accepted ? null : placed.length > 0 ? check.reason ?? "Bet rejected" : null,
      treasury: { ...s.treasury, reservedLiability: s.treasury.reservedLiability + (accepted ? check.maxNetPayout : 0) },
      stats: { ...s.stats, wagered: s.stats.wagered + total },
    });
    setTimeout(() => {
      if (get().phase === "closed") {
        sfx.spin();
        set({ phase: "spinning" });
      }
    }, 900);
  },

  onSpinComplete: () => {
    const s = get();
    if (s.phase !== "spinning" || !s.pendingReveal) return;
    const placed = toPlaced(s.bets);
    const settlement = settleBets(placed, s.pendingReveal.result);
    const record: RoundRecord = { roundId: s.roundId, result: s.pendingReveal.result, settlement, reveal: s.pendingReveal, at: Date.now() };
    const played = placed.length > 0;
    const won = settlement.netProfit > 0;
    const streak = !played ? s.stats.streak : won ? s.stats.streak + 1 : 0;
    if (played) {
      if (won) sfx.win();
      else sfx.lose();
    }
    const liabilityReleased = maximumLiability(placed).maxNetPayout;
    track("round_complete", { mode: s.mode, played, won });
    set({
      phase: "result",
      balance: s.balance + settlement.totalReturned,
      lastRound: record,
      rounds: [record, ...s.rounds].slice(0, 200),
      recent: [s.pendingReveal.result, ...s.recent].slice(0, 100),
      treasury: {
        ...s.treasury,
        reservedLiability: Math.max(0, s.treasury.reservedLiability - liabilityReleased),
        bankroll: s.treasury.bankroll + settlement.totalStaked - settlement.totalReturned,
      },
      stats: {
        spins: s.stats.spins + (played ? 1 : 0),
        wins: s.stats.wins + (won ? 1 : 0),
        largestWin: Math.max(s.stats.largestWin, settlement.netProfit),
        streak,
        bestStreak: Math.max(s.stats.bestStreak, streak),
        wagered: s.stats.wagered,
      },
    });
  },

  nextRound: () => {
    const s = get();
    if (s.phase !== "result") return;
    const roundId = s.roundId + 1;
    set({ phase: "betting", bets: {}, history: [], pendingReveal: null, betsLocked: false, roundId, error: null, ...newCommitment(roundId) });
  },
}));
