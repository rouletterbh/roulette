"use client";

import { useMounted } from "@/lib/hooks/use-mounted";
import { tableName, type LiabilityRow } from "@/lib/web3/treasury-view";
import { cn, formatUsd } from "@/lib/utils";

/**
 * ACTIVE LIABILITIES (chain): one row per unsettled round read from `getRound`
 * (reservedUnits is the contract's own worst-case reservation). Empty state is
 * honest: no rows are invented while the operator has nothing open.
 */
export function ChainActiveLiabilities({ rows, scanned, hasPeg, className }: { rows: LiabilityRow[]; scanned: boolean; hasPeg: boolean; className?: string }) {
  const mounted = useMounted();
  const totalUnits = rows.reduce((s, r) => s + r.reservedUnits, 0);
  const totalUsd = rows.reduce((s, r) => s + r.reservedUsd, 0);
  const dot = (s: LiabilityRow["status"]) => (s === "Open" ? "bg-accent" : s === "Closed" ? "bg-ink" : "bg-faint");

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] text-[12.5px]">
        <thead>
          <tr className="text-left">
            <th className="microlabel border-b border-border py-2 font-normal">Round</th>
            <th className="microlabel border-b border-border py-2 font-normal">Table</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Bets · staked</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Reserved · % of cap</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {!mounted || !scanned ? (
            <tr>
              <td colSpan={5} className="border-b border-hairline py-4 text-muted">
                Reading Robinhood Chain…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="border-b border-hairline py-4 text-muted">
                No open rounds.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={`${r.tableId}-${r.roundId}`}>
                <td className="border-b border-hairline py-2.5 font-mono text-[12px] tnum text-ink">#{r.roundId.toString()}</td>
                <td className="border-b border-hairline py-2.5 text-ink">{tableName(r.tableId)}</td>
                <td className="border-b border-hairline py-2.5 text-right font-mono text-[12px] tnum">
                  <span className="text-ink">{r.betCount}</span>
                  <span className="text-muted"> · {r.totalStakedUnits.toLocaleString("en-US")} units</span>
                </td>
                <td className="border-b border-hairline py-2.5 text-right font-mono text-[12px] tnum">
                  <span className="text-ink">{hasPeg ? formatUsd(r.reservedUsd) : `${r.reservedUnits} units`}</span>
                  <span className="text-muted"> · {r.pctOfCap == null ? "—" : `${r.pctOfCap.toFixed(1)}%`}</span>
                </td>
                <td className="border-b border-hairline py-2.5 text-right">
                  <span className="microlabel inline-flex items-center gap-1.5 !text-ink">
                    <span className={cn("h-1.5 w-1.5 rounded-full", dot(r.status))} aria-hidden />
                    {r.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="microlabel py-2.5">
              Total reserved
            </td>
            <td className="py-2.5 text-right font-mono text-[12px] tnum text-ink">{mounted && scanned && rows.length ? (hasPeg ? formatUsd(totalUsd) : `${totalUnits} units`) : "—"}</td>
            <td className="py-2.5 text-right microlabel"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
