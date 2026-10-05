import type { AgentSeat, AgentLogKind } from "@/store/agent-seat";
import type { NetworkSummary, TelemetryEvent, TelemetryKind } from "@/store/agent-network";

/**
 * Pure derivations over the viewer's own agent seats (src/store/agent-seat.ts).
 * With demo mode off these are the only agents the product may show: nothing
 * about other people's agents exists on chain, so network-wide counts are never
 * invented. No I/O; tested next to this file.
 */

/** Seats the viewer owns: their connected wallet's, plus practice seats. */
export function ownSeats(seats: Readonly<Record<string, AgentSeat>>, address: string | null | undefined): AgentSeat[] {
  return Object.values(seats)
    .filter((s) => s.owner === "practice" || (!!address && s.owner.toLowerCase() === address.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface OwnSeatTotals {
  /** Seats currently approved and running. */
  seated: number;
  decisions: number;
  skips: number;
  /** Settled rounds that ended with a positive delta. */
  collections: number;
  rounds: number;
}

export function summarizeOwnSeats(seats: readonly AgentSeat[]): NetworkSummary & OwnSeatTotals {
  const by = (status: AgentSeat["status"]) => seats.filter((s) => s.status === status).length;
  const lastKind = (s: AgentSeat): AgentLogKind | undefined => s.log[s.log.length - 1]?.kind;
  const active = seats.filter((s) => s.status === "active");
  const executing = active.filter((s) => lastKind(s) === "bet").length;
  const settling = active.filter((s) => lastKind(s) === "result").length;
  return {
    active: active.length,
    observing: Math.max(0, active.length - executing - settling),
    executing,
    settling,
    paused: by("paused"),
    stopped: by("stopped"),
    seated: active.length,
    decisions: seats.reduce((n, s) => n + s.decisions, 0),
    skips: seats.reduce((n, s) => n + s.skips, 0),
    collections: seats.reduce((n, s) => n + s.log.filter((l) => l.kind === "result" && (l.delta ?? 0) > 0).length, 0),
    rounds: seats.reduce((n, s) => n + s.roundsPlayed, 0),
  };
}

const KIND: Record<AgentLogKind, TelemetryKind> = {
  created: "system",
  approved: "wake",
  bet: "prepare",
  skip: "skip",
  result: "result",
  paused: "pause",
  resumed: "resume",
  stopped: "stop",
  chain: "system",
};

/** The seats' own logs as activity-feed events (oldest first). */
export function ownSeatEvents(seats: readonly AgentSeat[]): TelemetryEvent[] {
  return seats
    .flatMap((s) =>
      s.log.map<TelemetryEvent>((l) => ({
        id: `${s.id}:${l.id}`,
        at: l.at,
        kind: l.kind === "result" && (l.delta ?? 0) > 0 ? "collect" : KIND[l.kind],
        agentId: s.id,
        code: s.code,
        tableId: s.tableId,
        roundId: s.lastRoundId ?? 0,
        text: l.text,
        delta: l.delta,
      })),
    )
    .sort((a, b) => a.at - b.at);
}
