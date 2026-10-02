"use client";

import { useMounted } from "@/lib/hooks/use-mounted";
import type { RewardRowView } from "@/lib/web3/treasury-view";
import { cn, formatNumber, formatUsd } from "@/lib/utils";

/**
 * REWARD INVENTORY (chain): registry tokens with a contract address are read from
 * RewardVault (`status`, `inventory`, `quote` for $1). USD appears only when the
 * vault's oracle has a fresh posted price. Stock Tokens have no address and stay
 * "Not yet listed".
 */
export function ChainRewardInventory({ rows, fetched }: { rows: RewardRowView[]; fetched: boolean }) {
  const mounted = useMounted();
  const ready = mounted && fetched;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead>
          <tr className="text-left">
            <th className="microlabel border-b border-border py-2 font-normal">Asset</th>
            <th className="microlabel border-b border-border py-2 font-normal">Category</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Inventory</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Oracle price</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Min. claim</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const onChain = !!r.token.contractAddress;
            return (
              <tr key={r.token.id}>
                <td className="border-b border-hairline py-2.5 font-medium">
                  {r.token.symbol} <span className="font-normal text-muted">{r.token.name}</span>
                </td>
                <td className="border-b border-hairline py-2.5 text-muted">{r.token.category === "stock-token" ? "Stock Token" : "Ecosystem"}</td>
                <td className="border-b border-hairline py-2.5 text-right font-mono text-[12.5px] tnum">
                  {!onChain ? (
                    "—"
                  ) : !ready ? (
                    <span className="text-muted">…</span>
                  ) : (
                    <>
                      <span className="text-ink">{formatNumber(r.inventoryTokens ?? 0, { maximumFractionDigits: 4 })}</span>
                      <span className="text-muted"> {r.token.symbol}</span>
                      {r.inventoryUsd != null && <span className="text-muted"> · {formatUsd(r.inventoryUsd)}</span>}
                    </>
                  )}
                </td>
                <td className="border-b border-hairline py-2.5 text-right font-mono text-[12.5px] tnum">{!onChain ? "—" : !ready ? <span className="text-muted">…</span> : r.priceUsd != null ? formatUsd(r.priceUsd, { maximumFractionDigits: 6 }) : <span className="text-muted">no fresh price</span>}</td>
                <td className="border-b border-hairline py-2.5 text-right font-mono text-[12.5px] tnum">{formatUsd(r.minimumPayoutUsd)}</td>
                <td className="border-b border-hairline py-2.5 text-right">
                  <span className="microlabel inline-flex items-center gap-1.5 !text-ink">
                    <span className={cn("h-1.5 w-1.5 rounded-full", ready && r.status === "available" ? "bg-accent" : ready && r.status === "low" ? "bg-agent-warn" : "bg-faint")} aria-hidden />
                    {!onChain ? r.statusLabel : ready ? r.statusLabel : "Reading…"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
