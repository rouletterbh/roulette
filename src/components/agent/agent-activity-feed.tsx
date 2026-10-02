"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAgentNetwork, type TelemetryEvent } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";

const fmt = (t: number) => {
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
};

/**
 * AgentActivityFeed: execution telemetry, not chat. Monospace timestamps,
 * compact prose, newest at the bottom (auto-scroll) or top (`newestFirst`).
 */
export function AgentActivityFeed({ tableId, agentId, limit = 14, className, newestFirst, compact, extra = [], title = "Activity" }: { tableId?: string; agentId?: string; limit?: number; className?: string; newestFirst?: boolean; compact?: boolean; extra?: TelemetryEvent[]; title?: string | null }) {
  const mounted = useMounted();
  const events = useAgentNetwork((s) => s.events);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  let list = [...events, ...extra].sort((a, b) => a.at - b.at);
  if (tableId) list = list.filter((e) => e.tableId === tableId || e.agentId === null);
  if (agentId) list = list.filter((e) => e.agentId === agentId);
  list = list.slice(-limit);
  if (newestFirst) list = [...list].reverse();

  useEffect(() => {
    if (!newestFirst && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [list.length, newestFirst]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {title && <div className="mb-2 flex items-center justify-between"><span className="microlabel">{title}</span><span className="microlabel">demo telemetry</span></div>}
      <ol ref={ref} className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "space-y-1" : "space-y-1.5")} aria-live="polite" aria-label="Agent activity">
        {!mounted || list.length === 0 ? (
          <li className="text-[12px] text-muted">Waiting for the network…</li>
        ) : (
          <AnimatePresence initial={false}>
            {list.map((e) => (
              <motion.li key={e.id} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className={cn("grid items-baseline gap-x-3 text-[12px] leading-snug", compact ? "grid-cols-[52px_minmax(0,1fr)]" : "grid-cols-[56px_64px_minmax(0,1fr)]")}>
                <span className="font-mono text-[10.5px] tnum text-faint">{fmt(e.at)}</span>
                {!compact && (
                  e.agentId ? <Link href={`/agent/${e.agentId}`} className="truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink hover:underline">{e.code}</Link> : <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">Round</span>
                )}
                <span className={cn("min-w-0 truncate", e.kind === "collect" && "text-ink", e.kind === "stop" && "text-ink", (e.kind === "skip" || e.kind === "system") && "text-muted", e.kind !== "collect" && e.kind !== "stop" && e.kind !== "skip" && e.kind !== "system" && "text-ink-2")}>
                  {compact && e.agentId && <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink">{e.code}</span>}
                  {e.text}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        )}
      </ol>
    </div>
  );
}
