import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

/**
 * Editorial definition list for key figures. On narrow screens it is a
 * two-column list; on wide screens it becomes a hairline-divided row.
 */
export function StatList({ items, className, columns = 4, size = "md" }: { items: StatItem[]; className?: string; columns?: 2 | 3 | 4 | 5; size?: "md" | "lg" }) {
  const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[columns];
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-6 md:gap-x-0 md:gap-y-0 md:divide-x md:divide-hairline", cols, className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 md:px-6 md:first:pl-0 md:last:pr-0">
          <dt className="eyebrow">{it.label}</dt>
          <dd className={cn("mt-2 font-display tnum text-ink", size === "lg" ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl")}>{it.value}</dd>
          {it.hint && <dd className="mt-1 text-[12.5px] text-muted">{it.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** A labeled row for compact key/value tables (settings, oracle config, etc.). */
export function KeyRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-3 hairline-b text-[14px] last:border-b-0", className)}>
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right tnum text-ink">{children}</dd>
    </div>
  );
}
