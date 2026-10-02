"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/store/game";
import { useAgentSeats, decide, type AgentSeat } from "@/store/agent-seat";

/**
 * Runs an approved agent seat against the game store. It only ever calls the
 * same public actions a human would (setBets / placeBets) and logs each decision.
 */
export function useAgentDriver(seat: AgentSeat | undefined, shared: boolean) {
  const phase = useGame((s) => s.phase);
  const roundId = useGame((s) => s.roundId);
  const lastRound = useGame((s) => s.lastRound);
  const settledRef = useRef<number | null>(null);
  const seatId = seat?.id;
  const seatStatus = seat?.status;

  // Betting phase: decide and act once per round (re-evaluated when the seat is approved/resumed).
  useEffect(() => {
    if (!seatId || phase !== "betting" || seatStatus !== "active") return;
    const seats = useAgentSeats.getState();
    const s = seats.seats[seatId];
    if (!s) return;
    const d = decide(s, roundId);
    if (!d.act) {
      if (d.stop) seats.stop(seatId, d.stop);
      else if (d.skip && d.skip !== "already acted" && d.skip !== "not active") seats.recordSkip(seatId, roundId, d.skip);
      return;
    }
    const t = setTimeout(() => {
      const g = useGame.getState();
      if (g.phase !== "betting") return;
      const bets = Object.fromEntries(s.rules.bets.map((b) => [b.betId, b.stake]));
      const err = g.setBets(bets);
      if (err) {
        useAgentSeats.getState().recordSkip(seatId, roundId, err);
        return;
      }
      useAgentSeats.getState().recordBet(seatId, roundId, s.rules.bets);
      // Shared tables close on the timer; solo tables spin once the agent has bet.
      if (shared) g.placeBets();
      else setTimeout(() => useGame.getState().phase === "betting" && useGame.getState().placeBets(), 1200);
    }, 1500);
    return () => clearTimeout(t);
  }, [seatId, seatStatus, phase, roundId, shared]);

  // Result phase: book the outcome once.
  useEffect(() => {
    if (!seatId || phase !== "result" || !lastRound) return;
    if (settledRef.current === lastRound.roundId) return;
    const s = useAgentSeats.getState().seats[seatId];
    if (!s || s.lastRoundId !== lastRound.roundId) return;
    settledRef.current = lastRound.roundId;
    useAgentSeats.getState().recordResult(seatId, lastRound.roundId, lastRound.result, lastRound.settlement.netProfit);
  }, [seatId, phase, lastRound]);
}
