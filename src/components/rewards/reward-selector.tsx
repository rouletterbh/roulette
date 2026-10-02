"use client";

import { Badge } from "@/components/ui/badge";
import type { RewardInventory } from "@/lib/demo/rewards";
import { cn, formatUsd } from "@/lib/utils";
import { TokenLogo } from "@/components/layout/brand-logo";

export function RewardSelector({ items, amountUsd, value, onChange }: { items: RewardInventory[]; amountUsd: number; value: string | null; onChange: (id: string) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Choose payout asset">
      {items.map((r) => {
        const canCover = r.inventoryUsd >= amountUsd && amountUsd >= r.token.minimumPayout;
        const enabled = (r.status === "available" || r.status === "low") && canCover;
        const selected = value === r.token.id;
        return (
          <li key={r.token.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!enabled}
              onClick={() => onChange(r.token.id)}
              className={cn("flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", selected ? "border-ink bg-sunken dark:bg-surface" : "border-border hover:border-border-strong")}
            >
              <div className="flex items-center gap-3">
                <TokenLogo symbol={r.token.symbol} logoURI={r.token.logoURI} size={28} tone={r.token.category === "stock-token" ? "ink" : "accent"} />
                <div>
                <div className="text-[14px] font-medium">{r.token.symbol}</div>
                <div className="text-[12px] text-muted">{enabled ? `${formatUsd(amountUsd)} available` : r.status === "unverified" ? "availability dependent" : r.inventoryUsd < amountUsd ? `inventory ${formatUsd(r.inventoryUsd)}` : r.statusLabel}</div>
                </div>
              </div>
              <Badge tone={r.status === "available" ? "accent" : r.status === "low" ? "amber" : "outline"}>{r.statusLabel}</Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
