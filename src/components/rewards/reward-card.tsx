import { Badge } from "@/components/ui/badge";
import type { RewardInventory } from "@/lib/demo/rewards";
import { cn, formatUsd } from "@/lib/utils";
import { TokenLogo } from "@/components/layout/brand-logo";

export function RewardCard({ item, className }: { item: RewardInventory; className?: string }) {
  const { token, status } = item;
  const tone = status === "available" ? "accent" : status === "low" ? "amber" : "outline";
  return (
    <article className={cn("flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 dark:bg-elevated", status !== "available" && status !== "low" && "opacity-80", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <TokenLogo symbol={token.symbol} logoURI={token.logoURI} size={40} tone={token.category === "stock-token" ? "ink" : "accent"} />
          <div>
            <h3 className="text-[15px] font-medium leading-tight">{token.symbol}</h3>
            <p className="text-[12px] text-muted">{token.name}</p>
          </div>
        </div>
        <Badge tone={tone}>{item.statusLabel}</Badge>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline pt-4 text-[12.5px]">
        <dt className="text-muted">Category</dt><dd className="text-right">{token.category === "stock-token" ? "Stock Token" : token.category === "crypto" ? "Ecosystem" : "Special"}</dd>
        <dt className="text-muted">Network</dt><dd className="text-right">Robinhood Chain</dd>
        <dt className="text-muted">Inventory</dt><dd className="text-right tnum">{item.inventoryUsd > 0 ? formatUsd(item.inventoryUsd) : "—"}</dd>
        <dt className="text-muted">Price</dt><dd className="text-right tnum">{item.priceUsd ? formatUsd(item.priceUsd, { maximumFractionDigits: 4 }) : <span className="text-faint">oracle not set</span>}</dd>
        <dt className="text-muted">Min. claim</dt><dd className="text-right tnum">{formatUsd(token.minimumPayout)}</dd>
        <dt className="text-muted">Contract</dt><dd className="text-right font-mono text-[11px]">{token.contractAddress ?? <span className="text-faint">not set</span>}</dd>
      </dl>
    </article>
  );
}
