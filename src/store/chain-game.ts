"use client";

import { create } from "zustand";

/**
 * Bridge between GameTable (which stays wagmi-free) and ChainGameDriver. The driver
 * registers the live handlers while mounted; the table calls them instead of the
 * simulated store actions. Inactive (no-op handlers) in demo and practice modes.
 */
interface ChainGameState {
  active: boolean;
  /** Bets confirmed on chain for the current round ({betId → stake}). */
  submittedBets: Record<string, number>;
  /** Chain state has been read at least once (treasury + round). */
  ready: boolean;
  placeBets: () => void;
  leaveTable: () => void;
  reset: () => void;
}

const noop = () => {};

export const useChainGame = create<ChainGameState>()((set) => ({
  active: false,
  submittedBets: {},
  ready: false,
  placeBets: noop,
  leaveTable: noop,
  reset: () => set({ active: false, submittedBets: {}, ready: false, placeBets: noop, leaveTable: noop }),
}));
