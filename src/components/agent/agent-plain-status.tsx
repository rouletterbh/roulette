"use client";

import type { AgentSeat } from "@/store/agent-seat";
import { plainStatus } from "@/lib/agent/quick-start";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The first thing a running agent's panel says: "Playing · round #4821 · 3 bets so far ·
 * 22 chips left", with the Stop button next to it. Details (wallet, traces, log) go below.
 */
export function AgentPlainStatus({ seat, onStop, stopLabel = "Stop", showStop = true, className }: { seat: AgentSeat; onStop?: () => void; stopLabel?: string; showStop?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2", className)}>
      <p className="min-w-0 text-[14px] font-medium leading-snug tnum" aria-live="polite">{plainStatus(seat)}</p>
      {showStop && onStop && seat.status !== "stopped" && (
        <Button size="sm" variant="outline" onClick={onStop}>{stopLabel}</Button>
      )}
    </div>
  );
}
