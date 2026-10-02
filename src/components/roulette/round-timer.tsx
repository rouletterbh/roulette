"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function RoundTimer({ endsAt, duration, active, className, size = 64 }: { endsAt: number; duration: number; active: boolean; className?: string; size?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  const remaining = active ? Math.max(0, endsAt - now) : 0;
  const frac = active ? remaining / duration : 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }} role="timer" aria-live="polite" aria-label={active ? `${secs} seconds to bet` : "Betting closed"}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={frac < 0.2 ? "var(--casino-red)" : "var(--accent)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 100ms linear, stroke 300ms" }} />
      </svg>
      <span className="absolute font-display text-xl tnum leading-none">{active ? secs : "—"}</span>
    </div>
  );
}
