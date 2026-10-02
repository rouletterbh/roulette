"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { DemoTable } from "@/lib/demo/data";
import { Badge } from "@/components/ui/badge";
import { RecentNumbers } from "./recent-numbers";
import { PlayerStack } from "@/components/player/player-stack";
import { cn } from "@/lib/utils";

export function TableCard({ table, className }: { table: DemoTable; className?: string }) {
  const locked = table.status === "locked";
  const href = locked ? "/treasury" : `/table/${table.id}`;
  return (
    <motion.div whileHover={locked ? undefined : { y: -4 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} className={cn("h-full", className)}>
      <Link
        href={href}
        aria-disabled={locked}
        className={cn(
          "group flex h-full flex-col justify-between rounded-2xl border border-border bg-surface p-6 transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-md dark:bg-elevated",
          locked && "bg-transparent opacity-80 hover:border-border hover:shadow-none dark:bg-transparent",
        )}
      >
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-3xl leading-none">{table.name}</h3>
              <p className="mt-2 text-[13px] text-muted">{table.variant}</p>
            </div>
            {locked ? <Badge tone="outline">Locked</Badge> : <Badge tone="accent"><span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />Live</Badge>}
          </div>

          <div className="mt-7 grid grid-cols-3 gap-4 border-y border-hairline py-4 text-[13px]">
            <div><div className="eyebrow mb-1 text-[10px]">Players</div><div className="tnum font-medium">{table.players}</div></div>
            <div><div className="eyebrow mb-1 text-[10px]">Min</div><div className="tnum font-medium">{table.minBet} chip{table.minBet === 1 ? "" : "s"}</div></div>
            <div><div className="eyebrow mb-1 text-[10px]">Max</div><div className="tnum font-medium">{table.maxBet} chips</div></div>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          {locked ? (
            <p className="text-[12.5px] leading-snug text-muted">{table.lockedReason}</p>
          ) : (
            <>
              <RecentNumbers numbers={table.recent} max={6} />
              <PlayerStack count={table.players} seed={table.id} />
            </>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
