"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayerAvatar } from "@/components/player/player-avatar";
import type { SeatPlayer } from "@/store/live-table";
import { cn, formatNumber } from "@/lib/utils";

export function TablePlayers({
  seats,
  spectators,
  selfName,
  selfAddress,
  selfBets,
  onMute,
  onBlock,
  onReport,
  muted,
  className,
}: {
  seats: SeatPlayer[];
  spectators: number;
  selfName: string;
  selfAddress: string;
  selfBets: number;
  onMute: (w: string) => void;
  onBlock: (w: string) => void;
  onReport: (w: string) => void;
  muted: Set<string>;
  className?: string;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className={cn("", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow">Players · {seats.length + 1}</h2>
        <span className="text-[11px] tnum text-muted">{spectators} watching</span>
      </div>
      <ul className="space-y-1">
        <li className="flex items-center gap-3 rounded-lg bg-accent-soft/60 px-2.5 py-2">
          <PlayerAvatar address={selfAddress} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{selfName} <span className="text-muted">(you)</span></div>
          </div>
          <span className="text-[12px] tnum text-muted">{selfBets > 0 ? `${formatNumber(selfBets)} in` : "—"}</span>
        </li>
        {seats.map((s) => {
          const total = s.bets.reduce((a, b) => a + b.stake, 0);
          const isMuted = muted.has(s.wallet);
          return (
            <li key={s.wallet} className="group relative flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-sunken dark:hover:bg-elevated">
              <PlayerAvatar address={s.wallet} size={28} className={cn(isMuted && "opacity-40")} />
              <div className="min-w-0 flex-1">
                <Link href={`/player/${s.wallet}`} className="block truncate text-[13px] font-medium hover:underline">{s.name}</Link>
                <div className="text-[11px] text-muted">
                  {s.streak >= 2 ? <span className="text-ink">{s.streak} streak</span> : s.bets.length ? `${s.bets.length} bet${s.bets.length > 1 ? "s" : ""}` : "sitting"}
                </div>
              </div>
              <span className={cn("text-[12px] tnum", s.roundNet != null && s.roundNet > 0 ? "font-medium text-ink" : "text-muted")}>
                {s.roundNet != null ? (s.roundNet > 0 ? `+${formatNumber(s.roundNet)}` : s.roundNet < 0 ? `−${formatNumber(-s.roundNet)}` : "0") : total > 0 ? `${formatNumber(total)} in` : "—"}
              </span>
              <button type="button" aria-label={`Options for ${s.name}`} onClick={() => setMenu(menu === s.wallet ? null : s.wallet)} className="ml-1 h-6 w-6 rounded-full text-muted opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100 focus-visible:opacity-100">
                ···
              </button>
              {menu === s.wallet && (
                <div role="menu" className="absolute right-2 top-full z-20 mt-1 w-36 rounded-xl border border-border bg-surface p-1 shadow-lg dark:bg-elevated">
                  {[
                    ["Follow", () => {}],
                    [isMuted ? "Muted" : "Mute", () => onMute(s.wallet)],
                    ["Block", () => onBlock(s.wallet)],
                    ["Report", () => onReport(s.wallet)],
                  ].map(([label, fn]) => (
                    <button key={label as string} role="menuitem" type="button" onClick={() => { (fn as () => void)(); setMenu(null); }} className="block w-full rounded-lg px-3 py-1.5 text-left text-[13px] hover:bg-sunken dark:hover:bg-surface">
                      {label as string}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
