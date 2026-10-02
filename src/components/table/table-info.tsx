"use client";

import { useState } from "react";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import type { DemoPlayer } from "@/lib/demo/data";

export function RecentWinners({ winners, className }: { winners: Array<{ player: DemoPlayer; amount: number; bet: string; at: number }>; className?: string }) {
  return (
    <div className={className}>
      <h2 className="eyebrow mb-3">Recent winners</h2>
      {winners.length === 0 ? (
        <p className="text-[12.5px] text-muted">No wins yet this session.</p>
      ) : (
        <ul className="space-y-2">
          {winners.slice(0, 5).map((w, i) => (
            <li key={`${w.player.wallet}-${w.at}-${i}`} className="flex items-center gap-2.5 text-[12.5px]">
              <PlayerAvatar address={w.player.wallet} size={22} />
              <span className="min-w-0 flex-1 truncate">{w.player.name} <span className="text-muted">· {w.bet}</span></span>
              <span className="tnum font-medium">+{formatNumber(w.amount)}</span>
              <span className="text-[11px] text-faint">{relativeTime(w.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShareTable({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/table/${code}` : `/table/${code}`;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <code className="min-w-0 flex-1 truncate rounded-full border border-border px-3 py-1.5 text-[11.5px] text-muted">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {}
        }}
        className="h-8 shrink-0 rounded-full border border-border px-3 text-[12px] font-medium hover:border-ink"
      >
        {copied ? "Copied" : "Invite"}
      </button>
    </div>
  );
}
