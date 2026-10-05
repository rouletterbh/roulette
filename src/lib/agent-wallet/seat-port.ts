import { useAgentSeats } from "@/store/agent-seat";
import type { SeatPort } from "./runner";

/** The runner's view of one seat in the persisted seat store. */
export function storeSeatPort(seatId: string): SeatPort {
  const s = () => useAgentSeats.getState();
  return {
    get: () => s().seats[seatId],
    stop: (reason) => s().stop(seatId, reason),
    note: (text) => s().chainNote(seatId, text),
    recordSkip: (roundId, why, trace) => {
      s().recordSkip(seatId, roundId, why);
      s().recordTrace(seatId, trace);
    },
    beginBet: (roundId, bets, trace) => s().beginChainBet(seatId, roundId, bets, trace),
    adoptBet: (roundId, wager, trace) => s().adoptChainBet(seatId, roundId, wager, trace),
    setBetTx: (roundId, tx) => s().setChainBetTx(seatId, roundId, tx),
    resolveBet: (roundId, outcome) => s().resolveChainBet(seatId, roundId, outcome),
    markSwept: (at) => s().markSwept(seatId, at),
  };
}

/** For a key whose seat record no longer exists: there is nothing to record, only funds to return. */
export function orphanSeatPort(): SeatPort {
  const noop = () => {};
  return { get: () => undefined, stop: noop, note: noop, recordSkip: noop, beginBet: noop, adoptBet: noop, setBetTx: noop, resolveBet: noop, markSwept: noop };
}
