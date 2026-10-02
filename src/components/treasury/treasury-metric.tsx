import { cn, formatUsd } from "@/lib/utils";

/**
 * One cell of the treasury instrument grid. Large serif figure, microlabel,
 * mono derivation hint, corner index. Meant to sit in a `gap-px bg-hairline`
 * grid so the hairlines come from the grid, not the cell.
 */
export function TreasuryMetric({ label, value, hint, accent, className, format = "usd", index }: { label: string; value: number | string; hint?: string; accent?: boolean; className?: string; format?: "usd" | "int" | "pct"; index?: string }) {
  const text = typeof value === "string" ? value : format === "usd" ? formatUsd(value) : format === "pct" ? `${value.toFixed(1)}%` : String(value);
  return (
    <div className={cn("relative flex min-w-0 flex-col bg-canvas p-5 md:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="microlabel">{label}</div>
        {index && <span className="font-mono text-[10px] tnum text-faint">{index}</span>}
      </div>
      <div className="mt-6 flex items-baseline gap-2 font-display text-[2rem] leading-none tnum md:text-[2.5rem]">
        <span className="truncate">{text}</span>
        {accent && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
      </div>
      {hint && <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}
