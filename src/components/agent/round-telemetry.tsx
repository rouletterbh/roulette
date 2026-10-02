"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Tiny instrumentation labels (ROUND #… · COMMITMENT LOCKED · NEXT 00:11). */
export function RoundTelemetry({ roundId, phase, nextAt, agentsActive, exposurePct, treasurySafe = true, className, vertical }: { roundId: number; phase: "open" | "locked" | "settling"; nextAt: number; agentsActive?: number; exposurePct?: number; treasurySafe?: boolean; className?: string; vertical?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const secs = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const items: Array<[string, string]> = [
    ["Round", `#${roundId}`],
    ...(agentsActive != null ? [["Agents", `${agentsActive} active`] as [string, string]] : []),
    ["Commitment", phase === "open" ? "published" : "locked"],
    [phase === "open" ? "Closes" : phase === "locked" ? "Reveal" : "Next round", `00:${String(secs).padStart(2, "0")}`],
    ["Treasury", treasurySafe ? "safe" : "limit"],
    ...(exposurePct != null ? [["Exposure", `${exposurePct.toFixed(1)}%`] as [string, string]] : []),
  ];
  return (
    <dl className={cn(vertical ? "space-y-2" : "flex flex-wrap gap-x-6 gap-y-2", className)}>
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2">
          <dt className="microlabel">{k}</dt>
          <dd className={cn("font-mono text-[12px] tnum", v === "safe" || v === "locked" ? "text-ink" : "text-ink-2")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
