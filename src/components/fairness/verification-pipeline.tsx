"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export const PIPELINE_STAGES = ["Commit", "Lock", "Reveal", "Hash", "Result", "Verified"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_NOTES: Record<PipelineStage, string> = {
  Commit: "Before any bet is accepted, the operator publishes keccak256(serverSeed). The seed itself stays secret.",
  Lock: "Bets close. The combined bet data forms the player seed, so the operator cannot tune the result to the table.",
  Reveal: "The server seed is revealed and must hash to the commitment. A block hash adds entropy neither side controls.",
  Hash: "keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ roundId). One hash over four public inputs.",
  Result: "hash mod 37 is the pocket. The wheel animation only replays this number.",
  Verified: "Anyone recomputes both hashes. If either differs, the round is void and stakes refund.",
};

/**
 * Six-stage commit–reveal pipeline drawn with thin lines and mono labels.
 * `stage` is the index of the furthest lit stage (−1 = idle). Intermediate
 * values appear under each lit stage; `failed` marks a stage red.
 */
export function VerificationPipeline({ stage, values, failed, className }: { stage: number; values?: Partial<Record<PipelineStage, string>>; failed?: Partial<Record<PipelineStage, boolean>>; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <ol className={cn("grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-0", className)} aria-label="Verification pipeline">
      {PIPELINE_STAGES.map((s, i) => {
        const lit = i <= stage;
        const active = i === stage;
        const bad = Boolean(failed?.[s]) && lit;
        const last = i === PIPELINE_STAGES.length - 1;
        const value = lit ? values?.[s] : undefined;
        return (
          <li key={s} className="relative min-w-0">
            {/* node + line */}
            <div className="flex items-center" aria-hidden>
              <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                <span className={cn("h-2 w-2 border transition-colors duration-300", bad ? "border-casino-red bg-casino-red" : lit ? (last ? "border-ink bg-accent" : "border-ink bg-ink") : "border-border-strong bg-canvas")} />
                {active && !reduce && <span className={cn("absolute inset-0 animate-ping border opacity-60", bad ? "border-casino-red" : "border-ink")} style={{ animationDuration: "1.4s", animationIterationCount: 2 }} />}
              </span>
              {!last && (
                <span className="relative ml-2 h-px flex-1 bg-hairline lg:mr-2">
                  <motion.span className={cn("absolute inset-0 origin-left", bad ? "bg-casino-red" : "bg-ink")} initial={false} animate={{ scaleX: i < stage ? 1 : 0 }} transition={reduce ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }} />
                </span>
              )}
            </div>
            {/* label */}
            <div className="mt-3 flex items-baseline gap-2 pr-3">
              <span className="font-mono text-[10px] tnum text-faint">0{i + 1}</span>
              <span className={cn("microlabel transition-colors duration-300", bad ? "!text-casino-red" : lit ? "!text-ink" : "")}>{s}</span>
            </div>
            {/* value */}
            <div className="mt-1.5 min-h-[16px] pr-3">
              {value && (
                <motion.div initial={reduce ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={cn("truncate font-mono text-[11px] tnum", bad ? "text-casino-red" : "text-ink")} title={value}>
                  {value}
                </motion.div>
              )}
            </div>
            <p className="mt-2 pr-3 text-[12px] leading-relaxed text-muted">{STAGE_NOTES[s]}</p>
          </li>
        );
      })}
    </ol>
  );
}
