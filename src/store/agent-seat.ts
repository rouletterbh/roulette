"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { betFromId } from "@/lib/roulette/bets";

/**
 * Agent seats: a rule-based agent a player attaches to their own seat.
 * Modeled on the "set rules → check in before going live → log every decision"
 * pattern. Safety is structural: a dedicated chip allowance, an explicit approval
 * step, mandatory loss/round/time caps, and a public activity log. The agent
 * never touches outcomes and is bound by the same treasury limits as a human.
 */
export type AgentStatus = "pending-approval" | "active" | "paused" | "stopped";
export type AgentCadence = "every" | "every-other" | "after-loss";

export interface AgentBet {
  betId: string;
  stake: number;
}

export interface AgentRules {
  bets: AgentBet[];
  cadence: AgentCadence;
  maxRounds: number;
  /** Mandatory. Stop once net loss reaches this many chips. */
  stopLoss: number;
  /** Optional. Stop once net profit reaches this many chips. */
  stopWin: number | null;
  /** Mandatory. Minutes the agent may run before stopping. */
  timeLimitMinutes: number;
}

export type AgentLogKind = "created" | "approved" | "bet" | "skip" | "result" | "paused" | "resumed" | "stopped";
export interface AgentLogItem {
  id: string;
  at: number;
  kind: AgentLogKind;
  text: string;
  delta?: number;
}

export interface AgentSeat {
  id: string;
  name: string;
  /** One-line public thesis. */
  thesis: string;
  /** Where wins settle: primary asset, fallback, else win balance. */
  collection: { primaryAssetId: string | null; fallbackAssetId: string | null };
  owner: string;
  tableId: string;
  rules: AgentRules;
  allowance: number;
  status: AgentStatus;
  isPublic: boolean;
  createdAt: number;
  approvedAt: number | null;
  stoppedReason: string | null;
  roundsPlayed: number;
  net: number;
  lastRoundId: number | null;
  lastOutcomeWasLoss: boolean;
  log: AgentLogItem[];
  followers: number;
}

export const AGENT_CAPS = {
  maxRounds: 200,
  maxTimeMinutes: 120,
  /** Allowance may not exceed this share of the chips at the table. */
  allowanceShareOfBalance: 0.5,
  maxBetsPerRound: 6,
  minStopLossShare: 0.1,
} as const;

interface AgentSeatState {
  seats: Record<string, AgentSeat>;
  create: (input: { name: string; thesis?: string; collection?: AgentSeat["collection"]; owner: string; tableId: string; rules: AgentRules; allowance: number; isPublic: boolean }) => { ok: true; id: string } | { ok: false; error: string };
  approve: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  stop: (id: string, reason: string) => void;
  remove: (id: string) => void;
  recordBet: (id: string, roundId: number, bets: AgentBet[]) => void;
  recordSkip: (id: string, roundId: number, why: string) => void;
  recordResult: (id: string, roundId: number, result: number, delta: number) => void;
  activeFor: (owner: string, tableId: string) => AgentSeat | undefined;
}

let n = 0;
const lid = () => `${Date.now().toString(36)}-${(n++).toString(36)}`;
const log = (kind: AgentLogKind, text: string, delta?: number): AgentLogItem => ({ id: lid(), at: Date.now(), kind, text, delta });

export function validateRules(rules: AgentRules, allowance: number, balance: number): string | null {
  if (rules.bets.length === 0) return "Add at least one bet.";
  if (rules.bets.length > AGENT_CAPS.maxBetsPerRound) return `At most ${AGENT_CAPS.maxBetsPerRound} bets per round.`;
  for (const b of rules.bets) {
    if (!betFromId(b.betId)) return `Unknown bet ${b.betId}.`;
    if (!(b.stake > 0)) return "Stakes must be positive.";
  }
  const perRound = rules.bets.reduce((s, b) => s + b.stake, 0);
  if (!(allowance > 0)) return "Set a chip allowance.";
  if (allowance > balance * AGENT_CAPS.allowanceShareOfBalance) return `Allowance may not exceed ${AGENT_CAPS.allowanceShareOfBalance * 100}% of your chips at the table.`;
  if (perRound > allowance) return "One round of bets exceeds the allowance.";
  if (!(rules.stopLoss > 0)) return "A stop-loss is required.";
  if (rules.stopLoss > allowance) return "Stop-loss can't exceed the allowance.";
  if (rules.stopLoss < allowance * AGENT_CAPS.minStopLossShare) return "Stop-loss is too small to be meaningful.";
  if (rules.stopWin != null && rules.stopWin <= 0) return "Stop-win must be positive.";
  if (!(rules.maxRounds >= 1 && rules.maxRounds <= AGENT_CAPS.maxRounds)) return `Rounds must be 1–${AGENT_CAPS.maxRounds}.`;
  if (!(rules.timeLimitMinutes >= 1 && rules.timeLimitMinutes <= AGENT_CAPS.maxTimeMinutes)) return `Time limit must be 1–${AGENT_CAPS.maxTimeMinutes} minutes.`;
  return null;
}

/** Decide whether the agent should bet this round, and why not if not. */
export function decide(seat: AgentSeat, roundId: number, now = Date.now()): { act: true } | { act: false; stop?: string; skip?: string } {
  if (seat.status !== "active") return { act: false, skip: "not active" };
  if (seat.lastRoundId === roundId) return { act: false, skip: "already acted" };
  if (seat.roundsPlayed >= seat.rules.maxRounds) return { act: false, stop: "Reached the round limit." };
  if (seat.net <= -seat.rules.stopLoss) return { act: false, stop: "Stop-loss reached." };
  if (seat.rules.stopWin != null && seat.net >= seat.rules.stopWin) return { act: false, stop: "Stop-win reached." };
  if (seat.approvedAt != null && now - seat.approvedAt >= seat.rules.timeLimitMinutes * 60_000) return { act: false, stop: "Time limit reached." };
  const perRound = seat.rules.bets.reduce((s, b) => s + b.stake, 0);
  if (seat.allowance + Math.min(0, seat.net) < perRound) return { act: false, stop: "Allowance exhausted." };
  if (seat.rules.cadence === "every-other" && seat.roundsPlayed % 2 === 1 && seat.lastRoundId != null && roundId - seat.lastRoundId < 2) return { act: false, skip: "cadence: every other round" };
  if (seat.rules.cadence === "after-loss" && seat.roundsPlayed > 0 && !seat.lastOutcomeWasLoss) return { act: false, skip: "cadence: waits for a loss" };
  return { act: true };
}

export const useAgentSeats = create<AgentSeatState>()(
  persist(
    (set, get) => ({
      seats: {},
      create: ({ name, thesis = "", collection = { primaryAssetId: null, fallbackAssetId: null }, owner, tableId, rules, allowance, isPublic }) => {
        const err = validateRules(rules, allowance, Infinity);
        if (err) return { ok: false, error: err };
        const id = `agent-${lid()}`;
        const seat: AgentSeat = {
          id, name: name.trim() || "Untitled agent", thesis: thesis.trim().slice(0, 120), collection, owner, tableId, rules, allowance, status: "pending-approval", isPublic,
          createdAt: Date.now(), approvedAt: null, stoppedReason: null, roundsPlayed: 0, net: 0, lastRoundId: null, lastOutcomeWasLoss: false,
          log: [log("created", `Rules set: ${rules.bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label}`).join(", ")} · ${rules.cadence} · stop-loss ${rules.stopLoss} · ${rules.maxRounds} rounds · ${rules.timeLimitMinutes} min`)],
          followers: 0,
        };
        set({ seats: { ...get().seats, [id]: seat } });
        return { ok: true, id };
      },
      approve: (id) => patch(set, get, id, (s) => ({ status: "active", approvedAt: Date.now(), log: [...s.log, log("approved", "Approved by owner. Agent is live.")] })),
      pause: (id) => patch(set, get, id, (s) => (s.status === "active" ? { status: "paused", log: [...s.log, log("paused", "Paused by owner.")] } : {})),
      resume: (id) => patch(set, get, id, (s) => (s.status === "paused" ? { status: "active", log: [...s.log, log("resumed", "Resumed by owner.")] } : {})),
      stop: (id, reason) => patch(set, get, id, (s) => (s.status === "stopped" ? {} : { status: "stopped", stoppedReason: reason, log: [...s.log, log("stopped", reason)] })),
      remove: (id) => {
        const { [id]: _removed, ...rest } = get().seats;
        void _removed;
        set({ seats: rest });
      },
      recordBet: (id, roundId, bets) => patch(set, get, id, (s) => ({ lastRoundId: roundId, log: [...s.log, log("bet", `Round #${roundId}: ${bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label}`).join(", ")}`)].slice(-200) })),
      recordSkip: (id, roundId, why) => patch(set, get, id, (s) => ({ lastRoundId: roundId, log: [...s.log, log("skip", `Round #${roundId}: skipped (${why})`)].slice(-200) })),
      recordResult: (id, roundId, result, delta) =>
        patch(set, get, id, (s) => ({
          roundsPlayed: s.roundsPlayed + 1,
          net: s.net + delta,
          lastOutcomeWasLoss: delta < 0,
          log: [...s.log, log("result", `Round #${roundId}: ${result} → ${delta >= 0 ? "+" : ""}${delta}`, delta)].slice(-200),
        })),
      activeFor: (owner, tableId) => Object.values(get().seats).find((s) => s.owner === owner && s.tableId === tableId && s.status !== "stopped"),
    }),
    { name: "agent-seats" },
  ),
);

function patch(set: (p: Partial<AgentSeatState>) => void, get: () => AgentSeatState, id: string, fn: (s: AgentSeat) => Partial<AgentSeat>) {
  const s = get().seats[id];
  if (!s) return;
  set({ seats: { ...get().seats, [id]: { ...s, ...fn(s) } } });
}
