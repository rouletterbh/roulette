"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/store/game";
import { useAgentSeats, decide, evaluateCondition, type AgentSeat } from "@/store/agent-seat";
import { getMaximumSafeBet } from "@/lib/risk/engine";
import { colorOf } from "@/lib/roulette/constants";
import { useCollection } from "@/store/collection";

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
      const store = useAgentSeats.getState();
      const cond = evaluateCondition(s.rules.condition, g.recent);
      const safe = getMaximumSafeBet(g.treasury, 35);
      const maxAllowed = Math.max(0, Math.min(Math.floor(safe.maxRoundExposure), s.rules.maxBet ?? Infinity, s.allowance + Math.min(0, s.net)));
      const wager = s.rules.bets.reduce((a, b) => a + b.stake, 0);
      if (!cond.matched) {
        store.recordSkip(seatId, roundId, "condition not met");
        store.recordTrace(seatId, { roundId, at: Date.now(), decision: "SKIP", rule: cond.rule, input: cond.input, condition: false, leash: "n/a", commitment: g.commitment?.commitment });
        return;
      }
      if (wager > maxAllowed) {
        store.recordSkip(seatId, roundId, "leash: wager above maximum allowed");
        store.recordTrace(seatId, { roundId, at: Date.now(), decision: "SKIP", rule: cond.rule, input: cond.input, condition: true, leash: "fail", leashNote: `wager ${wager} > max ${maxAllowed}`, maxAllowed, wager, commitment: g.commitment?.commitment });
        return;
      }
      const bets = Object.fromEntries(s.rules.bets.map((b) => [b.betId, b.stake]));
      const err = g.setBets(bets);
      if (err) {
        store.recordSkip(seatId, roundId, err);
        store.recordTrace(seatId, { roundId, at: Date.now(), decision: "SKIP", rule: cond.rule, input: cond.input, condition: true, leash: "fail", leashNote: err, maxAllowed, wager, commitment: g.commitment?.commitment });
        return;
      }
      store.recordBet(seatId, roundId, s.rules.bets);
      store.recordTrace(seatId, { roundId, at: Date.now(), decision: `BET ${s.rules.bets.map((b) => b.betId.toUpperCase().replace("STRAIGHT:", "")).join(" + ")}`, rule: cond.rule, input: cond.input, condition: true, leash: "pass", leashNote: `${Math.max(0, s.rules.stopLoss + s.net)} to stop loss`, maxAllowed, wager, commitment: g.commitment?.commitment, tx: null });
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
    const store = useAgentSeats.getState();
    store.recordResult(seatId, lastRound.roundId, lastRound.result, lastRound.settlement.netProfit);
    const last = store.seats[seatId]?.traces.findLast((t) => t.roundId === lastRound.roundId);
    if (last) {
      const traces = store.seats[seatId].traces.map((t) => (t === last ? { ...t, result: `${colorOf(lastRound.result).toUpperCase()} ${lastRound.result}`, outcome: lastRound.settlement.netProfit } : t));
      useAgentSeats.setState({ seats: { ...store.seats, [seatId]: { ...store.seats[seatId], traces } } });
    }
    if (lastRound.settlement.netProfit > 0 && s.owner !== "practice") {
      useCollection.getState().acquire({ owner: s.owner, agentId: s.id, agentName: s.name, roundId: lastRound.roundId, result: lastRound.result, chips: lastRound.settlement.netProfit, rule: s.collection });
    }
  }, [seatId, phase, lastRound]);
}
