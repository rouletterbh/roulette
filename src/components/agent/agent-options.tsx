"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { siteConfig } from "@/config/site";
import { resolveChainTableId } from "@/lib/web3/contracts";
import { useChainTables, useRewardInventoryAll, useTreasurySnapshot } from "@/lib/web3/hooks";
import { buildRewardRows } from "@/lib/web3/treasury-view";
import { chainAssetOptions, chainTableOptions, demoAssetOptions, demoTableOptions, type AssetOption, type TableOption } from "@/lib/agent/options";
import { useCollection } from "@/store/collection";

/**
 * Where agent screens get their table and reward-asset choices.
 *   demo mode on : the simulated lists, exactly as before.
 *   demo mode off: RouletteGame tables and RewardVault assets read from chain. Until the
 *                  reads land (or when a contract is not configured) the lists are empty
 *                  and `ready` is false, so screens show an honest empty state.
 * The chain hooks need the WagmiProvider, which only exists with demo mode off, so the
 * chain branch is its own component.
 */
export interface AgentOptions {
  assets: AssetOption[];
  tables: TableOption[];
  /** False while chain reads are still loading. */
  ready: boolean;
  /** True when the options come from chain. */
  live: boolean;
  /** Chain reads are failing: lists may be empty because nothing could be read, not because nothing exists. */
  tablesUnreadable: boolean;
  assetsUnreadable: boolean;
  /** USD per chip unit at the treasury peg; null until known. 1 in demo mode. */
  chipUsd: number | null;
}

const EMPTY_LIVE: AgentOptions = { assets: [], tables: [], ready: false, live: true, tablesUnreadable: false, assetsUnreadable: false, chipUsd: null };
const Ctx = createContext<AgentOptions | null>(null);

function DemoOptions({ children }: { children: React.ReactNode }) {
  const value = useMemo<AgentOptions>(() => ({ assets: demoAssetOptions(), tables: demoTableOptions(), ready: true, live: false, tablesUnreadable: false, assetsUnreadable: false, chipUsd: 1 }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function ChainOptions({ children }: { children: React.ReactNode }) {
  const tables = useChainTables();
  const inv = useRewardInventoryAll();
  const treasury = useTreasurySnapshot();
  const chipUsd = treasury.chipUsdValue > 0n ? Number(treasury.chipUsdValue) / 1e18 : null;
  const value = useMemo<AgentOptions>(
    () => ({
      assets: inv.isFetched && !inv.readFailed ? chainAssetOptions(buildRewardRows(inv.byAddress), inv.byAddress) : [],
      tables: chainTableOptions(tables.tables, resolveChainTableId(null)),
      ready: (tables.isFetched || !tables.enabled) && (inv.isFetched || !inv.enabled),
      live: true,
      tablesUnreadable: tables.readFailed,
      assetsUnreadable: inv.readFailed,
      chipUsd,
    }),
    [inv.isFetched, inv.enabled, inv.readFailed, inv.byAddress, tables.tables, tables.isFetched, tables.enabled, tables.readFailed, chipUsd],
  );
  // The collection store values a settled win at the chip peg; it cannot read the chain itself.
  useEffect(() => {
    if (chipUsd != null) useCollection.getState().setLiveChipUsd(chipUsd);
  }, [chipUsd]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AgentOptionsProvider({ children }: { children: React.ReactNode }) {
  return siteConfig.demoMode ? <DemoOptions>{children}</DemoOptions> : <ChainOptions>{children}</ChainOptions>;
}

/** Outside a provider: demo lists in demo mode, an empty (never simulated) set otherwise. */
export function useAgentOptions(): AgentOptions {
  const ctx = useContext(Ctx);
  return useMemo(() => ctx ?? (siteConfig.demoMode ? { assets: demoAssetOptions(), tables: demoTableOptions(), ready: true, live: false, tablesUnreadable: false, assetsUnreadable: false, chipUsd: 1 } : EMPTY_LIVE), [ctx]);
}

/** One honest line for the reward-asset pickers when nothing can be chosen (demo off). */
export function vaultNote(o: AgentOptions): string {
  if (!o.ready) return "Reading the reward vault…";
  if (o.assetsUnreadable) return "The reward vault could not be read just now. Wins stay a win balance; retrying.";
  if (o.assets.length === 0) return "No reward asset is registered on the vault yet. Wins stay a win balance.";
  return "The vault holds no reward inventory right now. Wins stay a win balance you can claim later.";
}
