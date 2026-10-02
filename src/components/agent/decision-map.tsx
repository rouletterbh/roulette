import { cn } from "@/lib/utils";

export type DecisionMark = "skipped" | "executed" | "stopped" | "observed" | "collected";

/** ○ skipped · ● executed · ◆ collected · ■ stopped. Tiny, dense, readable. */
export function DecisionMap({ marks, className, cols = 24 }: { marks: DecisionMark[]; className?: string; cols?: number }) {
  return (
    <div className={className}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img" aria-label={`Decision map: ${marks.filter((m) => m === "executed").length} executed, ${marks.filter((m) => m === "skipped").length} skipped`}>
        {marks.map((m, i) => (
          <span key={i} title={m} className={cn("aspect-square w-full", m === "skipped" && "rounded-full border border-border-strong", m === "observed" && "rounded-full border border-hairline", m === "executed" && "rounded-full bg-ink", m === "collected" && "rotate-45 bg-accent", m === "stopped" && "bg-ink")} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 microlabel">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-border-strong" />skipped</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink" />executed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-accent" />collected</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-ink" />stopped</span>
      </div>
    </div>
  );
}
