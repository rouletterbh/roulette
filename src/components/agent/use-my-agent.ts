"use client";

import { useAgentSeats, type AgentSeat } from "@/store/agent-seat";
import { useWallet } from "@/store/wallet";
import type { AgentState } from "@/lib/agent/states";

/** The user's most relevant seat (active > paused > pending) across tables, plus a UI state. */
export function useMyAgent(): { seat: AgentSeat | undefined; state: AgentState } {
  const seats = useAgentSeats((s) => s.seats);
  const address = useWallet((s) => s.address);
  const mine = Object.values(seats).filter((s) => s.owner === address || s.owner === "practice");
  const order: AgentSeat["status"][] = ["active", "paused", "pending-approval", "stopped"];
  const seat = [...mine].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt - a.createdAt).find((s) => s.status !== "stopped");
  return { seat, state: seatState(seat) };
}

export function seatState(seat: AgentSeat | undefined): AgentState {
  if (!seat) return "sleeping";
  switch (seat.status) {
    case "active": return seat.lastRoundId != null && seat.log[seat.log.length - 1]?.kind === "bet" ? "locked" : "observing";
    case "paused": return "paused";
    case "pending-approval": return "waiting";
    case "stopped": return "stopped";
  }
}

export function seatLeash(seat: AgentSeat) {
  const elapsedMin = seat.approvedAt ? (Date.now() - seat.approvedAt) / 60_000 : 0;
  return {
    chips: Math.max(0, seat.allowance + Math.min(0, seat.net)),
    chipsMax: seat.allowance,
    loss: Math.max(0, -seat.net),
    lossMax: seat.rules.stopLoss,
    rounds: seat.roundsPlayed,
    roundsMax: seat.rules.maxRounds,
    minutes: Math.min(seat.rules.timeLimitMinutes, elapsedMin),
    minutesMax: seat.rules.timeLimitMinutes,
  };
}
