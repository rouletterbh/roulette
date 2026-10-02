"use client";

import { create } from "zustand";
import { rewardRegistry } from "@/config/tokens";
import { economicsDefaults, type EconomicsConfig } from "@/config/economics";
import { demoTables, demoTreasury } from "@/lib/demo/data";
import { demoNow } from "@/lib/demo/players";

/**
 * DEMO admin state. Nothing here signs a transaction or touches a contract;
 * it models the operator controls the protocol will expose, with the same
 * invariants: operators can pause and tune limits within engine caps, and can
 * never alter outcomes, history, escrow or a submitted wager.
 */
export type PauseKey = "protocol" | "deposits" | "gameplay" | "claims";

export interface TokenOverride {
  enabled: boolean;
  minimumPayout: number;
}

export interface InventoryLine {
  tokenId: string;
  symbol: string;
  units: number;
  usdValue: number;
  status: "stocked" | "low" | "empty";
}

export interface TableLimit {
  minBet: number;
  maxBet: number;
}

export interface OracleFeed {
  asset: string;
  address: string | null;
  lastUpdate: number | null;
}

export interface UnsettledRound {
  roundId: number;
  table: string;
  openedAt: number;
  reservedLiability: number;
  stage: "betting" | "closed" | "awaiting-reveal";
}

export interface SuspiciousItem {
  id: string;
  wallet: string;
  pattern: string;
  severity: "low" | "medium" | "high";
  firstSeen: number;
  status: "open" | "reviewing" | "cleared";
}

interface AdminState {
  pauses: Record<PauseKey, boolean>;
  setPause: (k: PauseKey, v: boolean) => void;

  tokens: Record<string, TokenOverride>;
  setTokenEnabled: (id: string, v: boolean) => void;
  setTokenMinPayout: (id: string, v: number) => void;

  inventory: InventoryLine[];

  tableLimits: Record<string, TableLimit>;
  setTableLimit: (id: string, v: TableLimit) => void;

  economics: EconomicsConfig;
  setEconomics: (patch: Partial<EconomicsConfig>) => void;
  resetEconomics: () => void;

  oracle: { maxStalenessSeconds: number; feeds: OracleFeed[] };
  setOracleStaleness: (s: number) => void;

  unsettled: UnsettledRound[];
  suspicious: SuspiciousItem[];
  setSuspiciousStatus: (id: string, status: SuspiciousItem["status"]) => void;
}

const MIN = 60_000;

export const useAdmin = create<AdminState>()((set) => ({
  pauses: { protocol: false, deposits: false, gameplay: false, claims: false },
  setPause: (k, v) => set((s) => ({ pauses: { ...s.pauses, [k]: v } })),

  tokens: Object.fromEntries(rewardRegistry.map((t) => [t.id, { enabled: t.enabled, minimumPayout: t.minimumPayout }])),
  setTokenEnabled: (id, v) => set((s) => ({ tokens: { ...s.tokens, [id]: { ...s.tokens[id], enabled: v } } })),
  setTokenMinPayout: (id, v) => set((s) => ({ tokens: { ...s.tokens, [id]: { ...s.tokens[id], minimumPayout: Math.max(0, v) } } })),

  inventory: [
    { tokenId: "crypto-eth", symbol: "ETH", units: 0.0142, usdValue: 38.2, status: "stocked" },
    { tokenId: "stock-nvda", symbol: "NVDA", units: 0.12, usdValue: 14.6, status: "low" },
    { tokenId: "stock-aapl", symbol: "AAPL", units: 0.05, usdValue: 12.1, status: "low" },
    { tokenId: "stock-tsla", symbol: "TSLA", units: 0, usdValue: 0, status: "empty" },
    { tokenId: "crypto-cashcat", symbol: "CASHCAT", units: 0, usdValue: 0, status: "empty" },
  ],

  tableLimits: Object.fromEntries(demoTables.map((t) => [t.id, { minBet: t.minBet, maxBet: t.maxBet }])),
  setTableLimit: (id, v) => set((s) => ({ tableLimits: { ...s.tableLimits, [id]: v } })),

  economics: { ...economicsDefaults },
  setEconomics: (patch) => set((s) => ({ economics: { ...s.economics, ...patch } })),
  resetEconomics: () => set({ economics: { ...economicsDefaults } }),

  oracle: {
    maxStalenessSeconds: 900,
    feeds: [
      { asset: "ETH / USD", address: null, lastUpdate: null },
      { asset: "NVDA Stock Token / USD", address: null, lastUpdate: null },
      { asset: "AAPL Stock Token / USD", address: null, lastUpdate: null },
      { asset: "USDC / USD", address: null, lastUpdate: null },
    ],
  },
  setOracleStaleness: (maxStalenessSeconds) => set((s) => ({ oracle: { ...s.oracle, maxStalenessSeconds: Math.max(60, Math.min(86_400, Math.round(maxStalenessSeconds))) } })),

  unsettled: Array.from({ length: demoTreasury.unsettledRounds }, (_, i) => ({
    roundId: 48_311 + i * 7,
    table: ["NEON 01", "CLASSIC", "LATE SHIFT"][i % 3],
    openedAt: demoNow - (2 + i * 3) * MIN,
    reservedLiability: [24.5, 16.26, 10][i % 3],
    stage: (["awaiting-reveal", "closed", "betting"] as const)[i % 3],
  })),

  suspicious: [
    { id: "sus-1", wallet: "0x7a1c3e5f9b2d4c6e8a0f1b3d5c7e9a1b3d5f7a9c", pattern: "Three wallets funded from one source, referring each other", severity: "high", firstSeen: demoNow - 6 * 60 * MIN, status: "open" },
    { id: "sus-2", wallet: "0x2b4d6f8a0c2e4a6c8e0b2d4f6a8c0e2b4d6f8a0c", pattern: "Rapid place / cancel wagers at the exposure cap", severity: "medium", firstSeen: demoNow - 26 * 60 * MIN, status: "reviewing" },
    { id: "sus-3", wallet: "0x9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b", pattern: "Mirrored red/black wagers across two wallets (wash betting)", severity: "medium", firstSeen: demoNow - 3 * 24 * 60 * MIN, status: "open" },
    { id: "sus-4", wallet: "0x4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d", pattern: "Session length above reminder threshold, limits disabled", severity: "low", firstSeen: demoNow - 5 * 24 * 60 * MIN, status: "cleared" },
  ],
  setSuspiciousStatus: (id, status) => set((s) => ({ suspicious: s.suspicious.map((x) => (x.id === id ? { ...x, status } : x)) })),
}));
