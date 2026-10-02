"use client";

import { AnimatePresence, motion } from "motion/react";
import type { RoundRecord } from "@/store/game";
import { colorOf } from "@/lib/roulette/constants";
import { formatNumber, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function RoundResult({ round, visible, onNext, unit = "chips", hideNext }: { round: RoundRecord | null; visible: boolean; onNext: () => void; unit?: string; hideNext?: boolean }) {
  const won = (round?.settlement.netProfit ?? 0) > 0;
  const c = round ? colorOf(round.result) : "green";
  return (
    <AnimatePresence>
      {visible && round && (
        <motion.div
          key={round.roundId}
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -6 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="pointer-events-auto absolute inset-x-0 bottom-[-8%] z-30 mx-auto w-[min(92%,340px)] rounded-2xl border border-border bg-surface/95 p-5 text-center shadow-lg backdrop-blur-md dark:bg-elevated/95"
          role="status"
          aria-live="assertive"
        >
          <div className="flex items-center justify-center gap-3">
            <span
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-xl font-display text-3xl text-white",
                c === "red" && "bg-casino-red",
                c === "black" && "bg-roulette-black",
                c === "green" && "bg-roulette-green",
              )}
            >
              {round.result}
            </span>
            <div className="text-left">
              <div className="eyebrow">{c}</div>
              <div className={cn("font-display text-3xl leading-none", won ? "text-ink" : "text-muted")}>
                {round.settlement.totalStaked === 0 ? "Spectating" : won ? `+${formatNumber(round.settlement.netProfit)}` : round.settlement.totalReturned > 0 ? "Even" : "No win"}
              </div>
              <div className="mt-1 text-[12px] text-muted">
                {round.settlement.totalStaked === 0 ? "No bets this round" : won ? `Returned ${formatNumber(round.settlement.totalReturned)} ${unit}` : `Staked ${formatNumber(round.settlement.totalStaked)} ${unit}`}
              </div>
            </div>
          </div>
          {!hideNext && (
            <Button size="sm" variant="primary" className="mt-4 w-full" onClick={onNext}>
              Next round
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
