"use client";

import { useMemo } from "react";
import { useAgentSeats } from "@/store/agent-seat";
import { useWallet } from "@/store/wallet";
import { ownSeatEvents, ownSeats, summarizeOwnSeats } from "@/lib/agent/own-seats";

/**
 * The viewer's own agent seats, memoised from the stable `seats` record so no
 * selector returns a fresh array. This is the only agent population shown when
 * demo mode is off.
 */
export function useOwnSeats() {
  const seats = useAgentSeats((s) => s.seats);
  const address = useWallet((s) => s.address);
  const mine = useMemo(() => ownSeats(seats, address), [seats, address]);
  const summary = useMemo(() => summarizeOwnSeats(mine), [mine]);
  const events = useMemo(() => ownSeatEvents(mine), [mine]);
  return { seats: mine, summary, events };
}
