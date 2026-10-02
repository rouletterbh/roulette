import { cn } from "@/lib/utils";

export function AgentRunSummary({ rounds, decisions, skips, collections, className }: { rounds: number; decisions: number; skips: number; collections?: number; className?: string }) {
  const items: Array<[string, number]> = [["Rounds", rounds], ["Decisions", decisions], ["Skips", skips], ...(collections != null ? [["Collections", collections] as [string, number]] : [])];
  return (
    <dl className={cn("grid grid-cols-3 gap-4 sm:grid-cols-4", className)}>
      {items.map(([k, v]) => <div key={k}><dt className="microlabel">{k}</dt><dd className="font-display text-3xl tnum">{v}</dd></div>)}
    </dl>
  );
}
