import type { LiquidityStatus } from "@/config/tokens";
import { getRewardInventory } from "@/lib/demo/rewards";
import { demoTables } from "@/lib/demo/data";
import { tableName, type ChainTableRecord, type RewardRowView, type VaultAssetRaw } from "@/lib/web3/treasury-view";

/**
 * Options for the agent builder, the agent seat panel and the collection rule: which
 * tables an agent can watch and which reward assets a win can be collected as. Pure
 * mapping, tested next to this file. With demo mode off the options come only from
 * chain reads (RouletteGame tables, RewardVault assets); nothing from src/lib/demo.
 */
export interface AssetOption {
  /** Registry id, e.g. "crypto-cashcat". */
  id: string;
  symbol: string;
  status: LiquidityStatus;
  statusLabel: string;
  /** Only assets the vault can pay out right now can be chosen. */
  selectable: boolean;
}

export interface TableOption {
  /** Seat/table key: "quick" for the default table's quick-play route, else the table id. */
  id: string;
  name: string;
}

/** Simulated options (demo mode on): unchanged behaviour. */
export function demoAssetOptions(): AssetOption[] {
  return getRewardInventory().map((i) => ({ id: i.token.id, symbol: i.token.symbol, status: i.status, statusLabel: i.statusLabel, selectable: i.status === "available" || i.status === "low" }));
}

export function demoTableOptions(): TableOption[] {
  return [{ id: "quick", name: "Quick play (solo)" }, ...demoTables.filter((t) => t.status === "live").map((t) => ({ id: t.id, name: t.name }))];
}

/**
 * Assets registered on the RewardVault, with their on-chain status. Registry tokens the
 * vault does not know (no address, or not registered) are left out rather than listed
 * as if they could ever be picked today.
 */
export function chainAssetOptions(rows: readonly RewardRowView[], byAddress: ReadonlyMap<string, VaultAssetRaw>): AssetOption[] {
  return rows
    .filter((r) => r.token.contractAddress && byAddress.get(r.token.contractAddress.toLowerCase())?.registered)
    .map((r) => {
      const raw = byAddress.get(r.token.contractAddress!.toLowerCase())!;
      const selectable = raw.enabled && (r.status === "available" || r.status === "low");
      return { id: r.token.id, symbol: r.token.symbol, status: selectable ? r.status : "unavailable", statusLabel: !raw.enabled ? "Not enabled" : r.status === "unavailable" ? "No vault inventory" : r.statusLabel, selectable };
    });
}

/**
 * Active public tables on chain. The default table is offered under the "quick" key
 * because that is the route the chain driver serves it on (see buildTableRows).
 */
export function chainTableOptions(tables: readonly ChainTableRecord[], defaultTableId: number): TableOption[] {
  return tables.filter((t) => t.active && !t.isPrivate).map((t) => ({ id: t.id === defaultTableId ? "quick" : String(t.id), name: tableName(t.id) }));
}

/** Display name for a seat's table key. */
export function tableLabel(tableId: string, options: readonly TableOption[], live: boolean): string {
  if (tableId === "practice") return "Practice table";
  if (!live) {
    if (tableId === "quick") return "Quick play";
    return demoTables.find((t) => t.id === tableId)?.name ?? tableId;
  }
  const hit = options.find((o) => o.id === tableId);
  if (hit) return hit.name;
  if (tableId === "quick") return "the onchain table";
  return /^\d+$/.test(tableId) ? tableName(Number(tableId)) : tableId;
}
