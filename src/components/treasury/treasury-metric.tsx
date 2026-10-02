import { cn, formatUsd } from "@/lib/utils";

export function TreasuryMetric({ label, value, hint, accent, className, format = "usd" }: { label: string; value: number; hint?: string; accent?: boolean; className?: string; format?: "usd" | "int" | "pct" }) {
  const text = format === "usd" ? formatUsd(value) : format === "pct" ? `${value.toFixed(1)}%` : String(value);
  return (
    <div className={cn("border-t border-border pt-4", className)}>
      <div className="eyebrow mb-2 text-[10px]">{label}</div>
      <div className="font-display text-3xl tnum leading-none md:text-4xl">
        {text}
        {accent && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-hidden />}
      </div>
      {hint && <p className="mt-2 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}
