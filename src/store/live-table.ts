"use client";

import { create } from "zustand";
import { useGame } from "./game";
import { demoPlayers, type DemoPlayer, type TableSpeed } from "@/lib/demo/data";
import { mulberry32, hashString } from "@/lib/demo/prng";
import { OUTSIDE_BETS, straight, type PlacedBet } from "@/lib/roulette/bets";
import { settleBets } from "@/lib/roulette/settle";

/**
 * Shared-table ambience for DEMO mode: a timer-driven round loop, simulated
 * seat-mates, their bets, reactions and a feed. Outcomes still come from the
 * game store's commit–reveal; simulated players merely bet on the same result.
 */
export const SPEED_MS: Record<TableSpeed, number> = { relaxed: 35_000, standard: 20_000, fast: 12_000 };
const CLOSED_MS = 900;
const RESULT_MS = 6_000;

export type FeedKind = "bet" | "win" | "join" | "leave" | "reaction" | "chat" | "system";
export interface FeedItem {
  id: string;
  kind: FeedKind;
  at: number;
  player?: DemoPlayer;
  text: string;
  amount?: number;
  self?: boolean;
}

export interface SeatPlayer extends DemoPlayer {
  seat: number;
  bets: PlacedBet[];
  roundNet: number | null;
  lastSeen: number;
}

interface LiveTableState {
  tableId: string | null;
  speed: TableSpeed;
  bettingEndsAt: number;
  resultShownAt: number | null;
  seats: SeatPlayer[];
  spectators: number;
  feed: FeedItem[];
  muted: Set<string>;
  blocked: Set<string>;
  reported: Set<string>;
  scheduled: Array<{ at: number; seat: number; bet: PlacedBet }>;
  recentWinners: Array<{ player: DemoPlayer; amount: number; bet: string; at: number }>;
  /** True when round open/close is driven by the chain (ChainGameDriver): the timer never closes or advances rounds. */
  externalRounds: boolean;
  /** Last game-store roundId the ambience was scheduled for (externalRounds only). */
  roundSeen: number;

  start: (tableId: string, speed: TableSpeed, seatCount: number, externalRounds?: boolean) => void;
  stop: () => void;
  tick: () => void;
  react: (emoji: string) => void;
  chat: (text: string) => void;
  mute: (wallet: string) => void;
  block: (wallet: string) => void;
  report: (wallet: string) => void;
  secondsLeft: () => number;
}

let feedCounter = 0;
const fid = () => `f${++feedCounter}`;

const EMOJI = ["🔥", "🎯", "👏", "😮", "🍀", "💚"];
const CHAT = ["gl all", "17 again?", "red is calm tonight", "nice hit", "one more", "welcome", "that corner though", "slow table, love it"];

export const useLiveTable = create<LiveTableState>()((set, get) => ({
  tableId: null,
  speed: "standard",
  bettingEndsAt: 0,
  resultShownAt: null,
  seats: [],
  spectators: 0,
  feed: [],
  muted: new Set(),
  blocked: new Set(),
  reported: new Set(),
  scheduled: [],
  recentWinners: [],
  externalRounds: false,
  roundSeen: 0,

  start: (tableId, speed, seatCount, externalRounds = false) => {
    const rnd = mulberry32(hashString(tableId));
    const picks = [...demoPlayers].sort(() => rnd() - 0.5).slice(0, Math.max(1, Math.min(seatCount, demoPlayers.length)));
    const seats: SeatPlayer[] = picks.map((p, i) => ({ ...p, seat: i + 1, bets: [], roundNet: null, lastSeen: Date.now() }));
    const now = Date.now();
    set({
      tableId,
      speed,
      seats,
      spectators: 3 + Math.floor(rnd() * 20),
      feed: [{ id: fid(), kind: "system", at: now, text: "You joined the table." }],
      bettingEndsAt: now + SPEED_MS[speed],
      resultShownAt: null,
      scheduled: scheduleBets(seats, now, SPEED_MS[speed], rnd),
      recentWinners: [],
      externalRounds,
      roundSeen: 0,
    });
  },

  stop: () => set({ tableId: null, seats: [], feed: [], scheduled: [] }),

  tick: () => {
    const t = get();
    if (!t.tableId) return;
    const g = useGame.getState();
    const now = Date.now();

    if (g.phase === "betting") {
      if (t.externalRounds && t.roundSeen !== g.roundId) {
        // The chain opened a new round: reset seat-mates and schedule their ambience bets.
        const rnd = mulberry32(hashString(`${t.tableId}-${g.roundId}`));
        const seats = t.seats.map((s) => ({ ...s, bets: [], roundNet: null }));
        set({ seats, bettingEndsAt: now + SPEED_MS[t.speed], resultShownAt: null, scheduled: scheduleBets(seats, now, SPEED_MS[t.speed], rnd), roundSeen: g.roundId });
        return;
      }
      // emit scheduled seat-mate bets
      const due = t.scheduled.filter((s) => s.at <= now);
      if (due.length) {
        const seats = t.seats.map((s) => ({ ...s }));
        const feed = [...t.feed];
        for (const d of due) {
          const seat = seats[d.seat];
          if (!seat || t.blocked.has(seat.wallet)) continue;
          seat.bets = [...seat.bets, d.bet];
          seat.lastSeen = now;
          feed.push({ id: fid(), kind: "bet", at: now, player: seat, text: `${d.bet.stake} on ${d.bet.label}`, amount: d.bet.stake });
        }
        set({ seats, feed: feed.slice(-80), scheduled: t.scheduled.filter((s) => s.at > now) });
      }
      if (now >= t.bettingEndsAt && !t.externalRounds) {
        g.closeRound();
        set({ feed: [...get().feed, { id: fid(), kind: "system" as const, at: now, text: "Betting closed." }].slice(-80) });
      }
      return;
    }

    if (g.phase === "result" && t.resultShownAt == null && g.lastRound) {
      const result = g.lastRound.result;
      const feed = [...t.feed];
      const winners = [...t.recentWinners];
      const seats = t.seats.map((s) => {
        const settlement = settleBets(s.bets, result);
        const net = settlement.netProfit;
        if (net > 0) {
          const best = s.bets.filter((b) => b.numbers.includes(result)).sort((a, b) => b.multiplier - a.multiplier)[0];
          feed.push({ id: fid(), kind: "win", at: now, player: s, text: `won ${settlement.totalReturned} on ${best?.label ?? "the table"}`, amount: settlement.totalReturned });
          winners.unshift({ player: s, amount: settlement.totalReturned, bet: best?.label ?? "", at: now });
        }
        return { ...s, roundNet: s.bets.length ? net : null, streak: net > 0 ? s.streak + 1 : s.bets.length ? 0 : s.streak };
      });
      if (g.lastRound.settlement.netProfit > 0) {
        feed.push({ id: fid(), kind: "win", at: now, text: `You won ${g.lastRound.settlement.totalReturned}`, amount: g.lastRound.settlement.totalReturned, self: true });
      }
      const rnd = mulberry32(hashString(`${t.tableId}-${g.roundId}`));
      const reactor = seats[Math.floor(rnd() * seats.length)];
      if (reactor && rnd() > 0.35) feed.push({ id: fid(), kind: "reaction", at: now + 400, player: reactor, text: EMOJI[Math.floor(rnd() * EMOJI.length)] });
      if (rnd() > 0.6) {
        const talker = seats[Math.floor(rnd() * seats.length)];
        if (talker) feed.push({ id: fid(), kind: "chat", at: now + 900, player: talker, text: CHAT[Math.floor(rnd() * CHAT.length)] });
      }
      set({ seats, feed: feed.slice(-80), resultShownAt: now, recentWinners: winners.slice(0, 8) });
      return;
    }

    if (g.phase === "result" && t.resultShownAt != null && now >= t.resultShownAt + RESULT_MS) {
      if (t.externalRounds) return; // the chain opens the next round
      g.nextRound();
      const rnd = mulberry32(hashString(`${t.tableId}-${g.roundId + 1}`));
      const seats = t.seats.map((s) => ({ ...s, bets: [], roundNet: null }));
      const endsAt = now + SPEED_MS[t.speed];
      set({ seats, bettingEndsAt: endsAt, resultShownAt: null, scheduled: scheduleBets(seats, now, SPEED_MS[t.speed], rnd) });
    }
  },

  react: (emoji) => set({ feed: [...get().feed, { id: fid(), kind: "reaction" as const, at: Date.now(), text: emoji, self: true }].slice(-80) }),
  chat: (text) => {
    const clean = text.trim().slice(0, 140);
    if (!clean) return;
    set({ feed: [...get().feed, { id: fid(), kind: "chat" as const, at: Date.now(), text: clean, self: true }].slice(-80) });
  },
  mute: (w) => set({ muted: new Set(get().muted).add(w) }),
  block: (w) => set({ blocked: new Set(get().blocked).add(w), muted: new Set(get().muted).add(w) }),
  report: (w) => set({ reported: new Set(get().reported).add(w) }),
  secondsLeft: () => Math.max(0, Math.ceil((get().bettingEndsAt - Date.now()) / 1000)),
}));

function scheduleBets(seats: SeatPlayer[], now: number, window: number, rnd: () => number) {
  const out: Array<{ at: number; seat: number; bet: PlacedBet }> = [];
  seats.forEach((s, i) => {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const at = now + 1500 + rnd() * (window - 4000);
      const roll = rnd();
      const stake = [1, 2, 5, 5, 10, 25][Math.floor(rnd() * 6)];
      const def = roll < 0.45 ? straight(Math.floor(rnd() * 37)) : roll < 0.8 ? OUTSIDE_BETS[["red", "black", "odd", "even", "low", "high"][Math.floor(rnd() * 6)]] : OUTSIDE_BETS[["dozen:1", "dozen:2", "dozen:3", "column:1", "column:2", "column:3"][Math.floor(rnd() * 6)]];
      out.push({ at, seat: i, bet: { ...def, stake } });
    }
  });
  return out.sort((a, b) => a.at - b.at);
}

export { CLOSED_MS, RESULT_MS };
