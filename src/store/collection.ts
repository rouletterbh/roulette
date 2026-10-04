"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRewardInventory } from "@/lib/demo/rewards";
import { siteConfig } from "@/config/site";

/**
 * Collection: what an owner has walked away with. Agent (or human) wins are
 * settled into the owner's chosen asset where the vault holds inventory, else
 * the fallback, else they remain a win balance. Every acquisition keeps the
 * round it came from so provenance is one click away. DEMO: 1 chip = $1.
 *
 * With demo mode off nothing is converted automatically: a win stays a win balance
 * until the owner claims it from the vault (a transaction they sign), so every
 * acquisition is recorded as "win-balance" and valued at the treasury's chip peg.
 */
export interface CollectionRule {
  primaryAssetId: string | null;
  fallbackAssetId: string | null;
}

export interface Acquisition {
  id: string;
  at: number;
  owner: string;
  agentId: string | null;
  agentName: string | null;
  roundId: number;
  result: number;
  chips: number;
  usd: number;
  assetId: string | null;
  symbol: string;
  /** Quantity is only known when a price oracle exists; null = settled at claim. */
  qty: number | null;
  status: "collected" | "win-balance";
}

interface CollectionState {
  acquisitions: Acquisition[];
  rules: Record<string, CollectionRule>;
  /** USD per chip unit at the treasury peg (demo off only); set by AgentOptionsProvider once read from chain. */
  liveChipUsd: number | null;
  setLiveChipUsd: (usd: number) => void;
  setRule: (owner: string, rule: CollectionRule) => void;
  acquire: (input: { owner: string; agentId: string | null; agentName: string | null; roundId: number; result: number; chips: number; rule: CollectionRule }) => Acquisition;
}

export const CHIP_USD_DEMO = 1;

export function resolveAsset(rule: CollectionRule) {
  // Demo off: no simulated inventory, and no automatic on-chain claim. The win stays a balance.
  if (!siteConfig.demoMode) return null;
  const inv = getRewardInventory();
  const pick = (id: string | null) => {
    if (!id) return null;
    const r = inv.find((i) => i.token.id === id);
    return r && (r.status === "available" || r.status === "low") ? r : null;
  };
  return pick(rule.primaryAssetId) ?? pick(rule.fallbackAssetId);
}

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => ({
      acquisitions: [],
      rules: {},
      liveChipUsd: null,
      setLiveChipUsd: (usd) => {
        if (get().liveChipUsd !== usd) set({ liveChipUsd: usd });
      },
      setRule: (owner, rule) => set({ rules: { ...get().rules, [owner]: rule } }),
      acquire: ({ owner, agentId, agentName, roundId, result, chips, rule }) => {
        const asset = resolveAsset(rule);
        const chipUsd = siteConfig.demoMode ? CHIP_USD_DEMO : (get().liveChipUsd ?? 0);
        const a: Acquisition = {
          id: `acq-${Date.now().toString(36)}-${roundId}`,
          at: Date.now(),
          owner, agentId, agentName, roundId, result, chips,
          usd: chips * chipUsd,
          assetId: asset?.token.id ?? null,
          symbol: asset?.token.symbol ?? "WIN",
          qty: asset?.priceUsd ? (chips * chipUsd) / asset.priceUsd : null,
          status: asset ? "collected" : "win-balance",
        };
        set({ acquisitions: [a, ...get().acquisitions].slice(0, 500) });
        return a;
      },
    }),
    { name: "collection", partialize: (s) => ({ acquisitions: s.acquisitions, rules: s.rules }) },
  ),
);

export function summarize(acqs: Acquisition[]) {
  const byAsset = new Map<string, { symbol: string; assetId: string | null; usd: number; count: number; qty: number | null }>();
  for (const a of acqs) {
    const k = a.assetId ?? "win-balance";
    const cur = byAsset.get(k) ?? { symbol: a.symbol, assetId: a.assetId, usd: 0, count: 0, qty: a.qty == null ? null : 0 };
    cur.usd += a.usd;
    cur.count += 1;
    if (cur.qty != null && a.qty != null) cur.qty += a.qty;
    byAsset.set(k, cur);
  }
  const holdings = [...byAsset.values()].sort((x, y) => y.usd - x.usd);
  return { holdings, totalUsd: acqs.reduce((s, a) => s + a.usd, 0), diversity: holdings.filter((h) => h.assetId).length };
}
