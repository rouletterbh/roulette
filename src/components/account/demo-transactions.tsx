import { explorerTx } from "@/config/chains";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { demoRelativeTime, formatDemoDateTime, type DemoTransaction } from "@/lib/demo/players";
import { formatUsd, cn } from "@/lib/utils";

/**
 * Simulated transaction list. Hashes are generated, not real; explorer links
 * are built with the real explorerTx helper so the shape is production-ready,
 * but they will not resolve until the protocol is live.
 */
export function DemoTransactions({ transactions, className }: { transactions: DemoTransaction[]; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
        <DemoBadge />
        <span>Simulated hashes. Explorer links will not resolve until contracts are deployed.</span>
      </div>
      <ol className="divide-y divide-hairline" aria-label="Transactions">
        {transactions.map((tx) => {
          const positive = tx.amount > 0;
          return (
            <li key={tx.hash} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3.5 md:grid-cols-[120px_1fr_auto_auto] md:items-center">
              <div className="flex items-center gap-2 md:contents">
                <span className="text-[13.5px] font-medium text-ink md:order-1">{tx.kind}</span>
                {tx.status === "pending" && (
                  <Badge tone="outline" className="md:hidden">
                    Pending
                  </Badge>
                )}
              </div>
              <span className={cn("text-right text-[14px] tnum md:order-3", positive ? "text-ink" : "text-muted")}>
                {tx.amount === 0 ? "—" : `${positive ? "+" : "−"}${tx.unit === "USD" ? formatUsd(Math.abs(tx.amount)) : `${Math.abs(tx.amount)} chips`}`}
              </span>
              <p className="col-span-2 min-w-0 truncate text-[12.5px] text-muted md:order-2 md:col-span-1">{tx.description}</p>
              <div className="col-span-2 flex items-center gap-3 text-[12px] text-muted md:order-4 md:col-span-1 md:justify-end">
                {tx.status === "pending" && (
                  <Badge tone="outline" className="hidden md:inline-flex">
                    Pending
                  </Badge>
                )}
                <time dateTime={new Date(tx.at).toISOString()} title={formatDemoDateTime(tx.at)}>
                  {demoRelativeTime(tx.at)}
                </time>
                <a
                  href={explorerTx(tx.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono tnum underline-offset-4 hover:text-ink hover:underline"
                  aria-label={`View simulated transaction ${tx.hash.slice(0, 10)} on Blockscout (opens in new tab)`}
                >
                  {tx.hash.slice(0, 8)}…{tx.hash.slice(-4)}
                </a>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
