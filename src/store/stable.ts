"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Your stable: agents you follow, plus a thesis you copied to prefill the builder. */
interface StableState {
  following: string[];
  draft: null | { name: string; betId: string; stake: number; cadence: string; stopLoss: number; stopWin: number | null; maxRounds: number; timeLimitMinutes: number };
  toggle: (agentId: string) => void;
  setDraft: (d: StableState["draft"]) => void;
}

export const useStable = create<StableState>()(
  persist(
    (set, get) => ({
      following: [],
      draft: null,
      toggle: (id) => set({ following: get().following.includes(id) ? get().following.filter((x) => x !== id) : [...get().following, id] }),
      setDraft: (draft) => set({ draft }),
    }),
    { name: "stable" },
  ),
);
