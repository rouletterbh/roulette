"use client";

import type { AgentLogItem } from "@/store/agent-seat";
import { cn, relativeTime } from "@/lib/utils";

export function AgentLog({ items, max = 12, className }: { items: AgentLogItem[]; max?: number; className?: string }) {
  const list = [...items].slice(-max).reverse();
  return (
    <ol className={cn("space-y-1.5 text-[12px]", className)} aria-label="Agent activity">
      {list.map((i) => (
        <li key={i.id} className="flex items-start gap-2">
          <span className={cn("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", i.kind === "result" ? (i.delta != null && i.delta > 0 ? "bg-accent" : "bg-faint") : i.kind === "stopped" ? "bg-casino-red" : i.kind === "bet" ? "bg-ink" : "bg-border-strong")} aria-hidden />
          <span className="min-w-0 flex-1 leading-snug text-ink-2">{i.text}</span>
          <span className="shrink-0 text-[11px] text-faint">{relativeTime(i.at)}</span>
        </li>
      ))}
      {list.length === 0 && <li className="text-muted">No activity yet.</li>}
    </ol>
  );
}
