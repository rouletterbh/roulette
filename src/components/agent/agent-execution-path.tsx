import { cn } from "@/lib/utils";

const STEPS = ["Observe", "Match rule", "Leash check", "Execute", "Settle", "Collect"] as const;
export type ExecutionStep = (typeof STEPS)[number];

/** Horizontal execution path with the current step lit. */
export function AgentExecutionPath({ current, className, labels }: { current: ExecutionStep | null; className?: string; labels?: Partial<Record<ExecutionStep, string>> }) {
  const idx = current ? STEPS.indexOf(current) : -1;
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Execution path">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="flex flex-col">
            <span className={cn("microlabel transition-colors", i === idx ? "!text-ink" : i < idx ? "!text-ink-2" : "")}>{s}</span>
            {labels?.[s] && <span className="font-mono text-[11px] text-ink-2">{labels[s]}</span>}
          </span>
          {i < STEPS.length - 1 && <span className={cn("h-px w-6 transition-colors", i < idx ? "bg-ink" : "bg-hairline")} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
