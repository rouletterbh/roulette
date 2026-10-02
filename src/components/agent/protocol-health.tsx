import { cn, formatUsd } from "@/lib/utils";

/** Compact protocol health instrument: collateralization, exposure, capacity. */
export function ProtocolHealth({ collateralizationPct, exposurePct, capacityUsd, reservedUsd, className, vertical }: { collateralizationPct: number; exposurePct: number; capacityUsd: number; reservedUsd: number; className?: string; vertical?: boolean }) {
  const items: Array<[string, string, boolean]> = [
    ["Treasury health", `${Math.min(999, collateralizationPct).toFixed(0)}%`, collateralizationPct >= 100],
    ["Round exposure", `${exposurePct.toFixed(1)}%`, exposurePct < 25],
    ["Payout capacity", formatUsd(capacityUsd), true],
    ["Reserved", formatUsd(reservedUsd), true],
  ];
  return (
    <dl className={cn(vertical ? "space-y-2" : "flex flex-wrap gap-x-8 gap-y-2", className)}>
      {items.map(([k, v, ok]) => (
        <div key={k} className="flex items-baseline gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-accent" : "bg-agent-warn")} aria-hidden />
          <dt className="microlabel">{k}</dt>
          <dd className="font-mono text-[12px] tnum text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
