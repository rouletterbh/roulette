"use client";

import Link from "next/link";
import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";

/** Thin operating strip: live network counts, round, treasury health. */
export function AgentCommandStrip({ className }: { className?: string }) {
  const mounted = useMounted();
  const summary = useAgentNetwork((s) => s.summary());
  const table = useAgentNetwork((s) => s.tables["neon-01"]);
  const items: Array<[string, string, boolean?]> = [
    ["Active", `${mounted ? summary.active : "—"}`, true],
    ["Observing", `${mounted ? summary.observing : "—"}`],
    ["Executing", `${mounted ? summary.executing : "—"}`],
    ["Paused", `${mounted ? summary.paused : "—"}`],
    ["Settling", `${mounted ? summary.settling : "—"}`],
    ["Round", mounted && table ? `#${table.roundId}` : "—"],
    ["Treasury health", "100%", true],
  ];
  return (
    <div className={cn("container-edge", className)}>
      <Link href="/agents" className="flex flex-wrap items-center gap-x-7 gap-y-2 border-y border-hairline py-3 transition-colors hover:bg-sunken/40">
        <span className="microlabel !text-ink">Agent network</span>
        {items.map(([k, v, dot]) => (
          <span key={k} className="flex items-baseline gap-2">
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
            <span className="font-mono text-[13px] tnum text-ink">{v}</span>
            <span className="microlabel">{k}</span>
          </span>
        ))}
      </Link>
    </div>
  );
}
