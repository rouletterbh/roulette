"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useRewardInventoryAll } from "@/lib/web3/hooks";
import { buildRewardRows } from "@/lib/web3/treasury-view";
import { TokenLogo } from "@/components/layout/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Reward-asset ticker when demo mode is off: status comes from RewardVault
 * (status / inventory / quote) for every registry token with an address;
 * Stock Tokens and unlisted assets stay "Not yet listed".
 */
export function ChainRewardsTicker() {
  const mounted = useMounted();
  const inv = useRewardInventoryAll();
  const rows = useMemo(() => buildRewardRows(inv.byAddress), [inv.byAddress]);
  const ready = mounted && (!inv.enabled || inv.isFetched);
  const list = [...rows, ...rows];
  return (
    <div className="relative mt-14 overflow-hidden border-y border-hairline py-5" aria-label="Reward assets ticker">
      <div className="ticker-track flex w-max gap-3 px-3">
        {list.map((r, i) => {
          const onChain = !!r.token.contractAddress;
          const label = !onChain ? r.statusLabel : ready ? r.statusLabel : "Reading…";
          return (
            <Link key={`${r.token.id}-${i}`} href="/rewards" className="flex items-center gap-3 rounded-full border border-border bg-surface py-2 pl-2 pr-4 text-[13px] dark:bg-elevated">
              <TokenLogo symbol={r.token.symbol} logoURI={r.token.logoURI} size={28} tone={r.token.category === "stock-token" ? "ink" : "accent"} />
              <span className="font-medium">{r.token.symbol}</span>
              <span className="text-muted">{r.token.category === "stock-token" ? "Stock Token" : "Robinhood Chain"}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", ready && r.status === "available" ? "bg-accent" : ready && r.status === "low" ? "bg-amber" : "bg-faint")} aria-hidden />
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
