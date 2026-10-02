"use client";

import { AnimatePresence, motion } from "motion/react";
import type { PlacedBet } from "@/lib/roulette/bets";
import { potentialPayout } from "@/lib/roulette/settle";
import type { Phase } from "@/store/game";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

export function BetSlip({
  bets,
  totalWager,
  liability,
  balance,
  phase,
  onPlace,
  onRemove,
  error,
  unit = "chips",
  practice,
  className,
  maxRoundExposure,
  locked,
  shared,
}: {
  bets: PlacedBet[];
  totalWager: number;
  liability: number;
  balance: number;
  phase: Phase;
  onPlace: () => void;
  onRemove?: (id: string) => void;
  error?: string | null;
  unit?: string;
  practice?: boolean;
  className?: string;
  maxRoundExposure?: number;
  locked?: boolean;
  shared?: boolean;
}) {
  const label =
    phase === "betting" ? (locked ? "Bets in · waiting for the wheel" : shared ? "Lock bets" : "Place bet") : phase === "closed" ? "Betting closed" : phase === "spinning" ? "Spinning…" : "Round settled";

  return (
    <div className={cn("flex flex-col rounded-2xl border border-border bg-surface dark:bg-elevated", className)}>
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Your bets</h2>
        {practice && <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">Practice</span>}
      </div>

      <ul className="flex max-h-[260px] flex-col gap-1 overflow-y-auto px-2 py-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {bets.length === 0 && (
            <motion.li key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 py-6 text-center text-[13px] text-muted">
              Tap the board to place a chip.
            </motion.li>
          )}
          {bets.map((b) => (
            <motion.li
              key={b.id}
              layout
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12, height: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-sunken dark:hover:bg-surface"
            >
              <div>
                <div className="text-[14px] font-medium">{b.label}</div>
                <div className="text-[11.5px] text-muted">
                  {kindLabel(b.kind)} · {b.multiplier}:1
                </div>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <div className="text-[14px] tnum">{formatNumber(b.stake)}</div>
                  <div className="text-[11.5px] tnum text-muted">pays {formatNumber(potentialPayout(b))}</div>
                </div>
                {onRemove && phase === "betting" && (
                  <button type="button" onClick={() => onRemove(b.id)} aria-label={`Remove ${b.label} bet`} className="text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100">
                    ×
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline px-5 py-4 text-[13px]">
        <dt className="text-muted">Total wager</dt>
        <dd className="text-right tnum font-medium">{formatNumber(totalWager)} {unit}</dd>
        <dt className="text-muted">Max liability</dt>
        <dd className="text-right tnum">{formatNumber(liability)} {unit}</dd>
        {maxRoundExposure != null && (
          <>
            <dt className="text-muted">Table limit</dt>
            <dd className={cn("text-right tnum", liability > maxRoundExposure && "text-casino-red")}>{formatNumber(maxRoundExposure, { maximumFractionDigits: 0 })} {unit}</dd>
          </>
        )}
        <dt className="text-muted">Balance</dt>
        <dd className="text-right tnum font-medium">{formatNumber(balance)} {unit}</dd>
      </dl>

      <div className="px-4 pb-4">
        <AnimatePresence>
          {error && (
            <motion.p key={error} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mb-3 rounded-lg bg-casino-red/10 px-3 py-2 text-[12.5px] text-casino-red">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <Button
          size="lg"
          variant={phase === "betting" && !locked ? "accent" : "outline"}
          className="w-full"
          disabled={phase !== "betting" || bets.length === 0 || !!locked}
          onClick={onPlace}
        >
          <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
            {label}
          </motion.span>
        </Button>
      </div>
    </div>
  );
}

function kindLabel(k: PlacedBet["kind"]) {
  return { straight: "Straight", split: "Split", street: "Street", corner: "Corner", sixline: "Six line", column: "Column", dozen: "Dozen", red: "Color", black: "Color", odd: "Parity", even: "Parity", low: "Half", high: "Half" }[k];
}
