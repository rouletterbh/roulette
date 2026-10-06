"use client";

import { useMemo } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useRewardInventoryAll } from "@/lib/web3/hooks";
import { buildRewardRows, type RewardRowView } from "@/lib/web3/treasury-view";
import type { RewardInventory } from "@/lib/demo/rewards";
import type { RewardCategory } from "@/config/tokens";
import { RewardCard } from "./reward-card";
import { Skeleton } from "@/components/ui/skeleton";

/** One sentence on /rewards about the project token. Factual: how RBL gets into the vault, no price or value talk. */
export const PROJECT_TOKEN_REWARDS_NOTE = "Winnings can be collected as RBL, the project token, at the oracle price, from vault inventory that is bought on its launch curve with the ETH players convert.";

/** Registry row → the card's item shape, with the vault's own status (nothing from src/lib/demo). */
export function rowToItem(r: RewardRowView): RewardInventory {
  return { token: r.token, inventoryUsd: r.inventoryUsd ?? 0, priceUsd: r.priceUsd, status: r.status, statusLabel: r.statusLabel };
}

/**
 * /rewards cards when demo mode is off: every registry token with a contract address is read from
 * RewardVault (assetConfig / status / inventory / quote). Unregistered addresses (RBL before the owner
 * registers it) and Stock Tokens read "Not yet listed"; nothing is ever shown as available by configuration.
 */
export function ChainRewardCards({ category }: { category: RewardCategory }) {
  const mounted = useMounted();
  const inv = useRewardInventoryAll();
  const rows = useMemo(() => buildRewardRows(inv.byAddress).filter((r) => r.token.category === category), [inv.byAddress, category]);
  const ready = mounted && (!inv.enabled || inv.isFetched);
  if (!ready) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Reading the reward vault">
        {rows.map((r) => <Skeleton key={r.token.id} className="h-[260px] rounded-2xl" />)}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => <RewardCard key={r.token.id} item={rowToItem(r)} />)}
      {inv.readFailed && <p role="alert" className="text-[13px] text-muted md:col-span-2 xl:col-span-3">The reward vault could not be read just now; statuses above are placeholders until it answers.</p>}
    </div>
  );
}
