"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Demo chip wallet. In production this mirrors ERC-1155 balances + escrow read from chain.
 * Values here are simulated and labeled DEMO in the UI.
 */
interface ChipsState {
  balance: number;
  winBalanceUsd: number;
  deposits: Array<{ id: string; amountUsd: number; chips: number; at: number; hash: string }>;
  setBalance: (n: number) => void;
  credit: (n: number) => void;
  debit: (n: number) => boolean;
  recordDeposit: (amountUsd: number, chips: number, hash: string) => void;
  addWin: (usd: number) => void;
  claim: (usd: number) => void;
}

export const useChips = create<ChipsState>()(
  persist(
    (set, get) => ({
      balance: 250,
      winBalanceUsd: 18.42,
      deposits: [],
      setBalance: (balance) => set({ balance }),
      credit: (n) => set({ balance: get().balance + n }),
      debit: (n) => {
        if (get().balance < n) return false;
        set({ balance: get().balance - n });
        return true;
      },
      recordDeposit: (amountUsd, chips, hash) =>
        set({ balance: get().balance + chips, deposits: [{ id: hash, amountUsd, chips, at: Date.now(), hash }, ...get().deposits].slice(0, 50) }),
      addWin: (usd) => set({ winBalanceUsd: get().winBalanceUsd + usd }),
      claim: (usd) => set({ winBalanceUsd: Math.max(0, get().winBalanceUsd - usd) }),
    }),
    { name: "chips-demo" },
  ),
);
