"use client";

import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { demoTables } from "@/lib/demo/data";
import { cn, formatUsd } from "@/lib/utils";

const nameOf = (id: string) => demoTables.find((t) => t.id === id)?.name ?? id.toUpperCase();

/**
 * ACTIVE LIABILITIES: one row per open table round from the demo agent network.
 * Exposure is shown as a share of the per-round cap and its USD equivalent.
 * Demo telemetry; nothing here is live chain state.
 */
export function ActiveLiabilities({ capUsd, className }: { capUsd: number; className?: string }) {
  const mounted = useMounted();
  const tables = useAgentNetwork((s) => s.tables);
  const rows = Object.values(tables).sort((a, b) => a.tableId.localeCompare(b.tableId));
  const usd = (pct: number) => (capUsd * pct) / 100;
  const total = rows.reduce((s, r) => s + usd(r.exposurePct), 0);

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[480px] text-[12.5px]">
        <thead>
          <tr className="text-left">
            <th className="microlabel border-b border-border py-2 font-normal">Round</th>
            <th className="microlabel border-b border-border py-2 font-normal">Table</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Exposure · % of cap</th>
            <th className="microlabel border-b border-border py-2 text-right font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {!mounted || rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="border-b border-hairline py-4 text-muted">
                Waiting for the network…
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.tableId}>
                <td className="border-b border-hairline py-2.5 font-mono text-[12px] tnum text-ink">#{r.roundId}</td>
                <td className="border-b border-hairline py-2.5 text-ink">{nameOf(r.tableId)}</td>
                <td className="border-b border-hairline py-2.5 text-right font-mono text-[12px] tnum">
                  <span className="text-ink">{formatUsd(usd(r.exposurePct))}</span>
                  <span className="text-muted"> · {r.exposurePct.toFixed(1)}%</span>
                </td>
                <td className="border-b border-hairline py-2.5 text-right">
                  <span className="microlabel inline-flex items-center gap-1.5 !text-ink">
                    <span className={cn("h-1.5 w-1.5 rounded-full", r.phase === "open" ? "bg-accent" : r.phase === "locked" ? "bg-ink" : "bg-faint")} aria-hidden />
                    {r.phase}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="microlabel py-2.5">
              Total open exposure
            </td>
            <td className="py-2.5 text-right font-mono text-[12px] tnum text-ink">{mounted && rows.length ? formatUsd(total) : "—"}</td>
            <td className="py-2.5 text-right microlabel"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
