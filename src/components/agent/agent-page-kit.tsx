"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { AgentState } from "@/lib/agent/states";
import type { AgentStatus } from "@/store/agent-seat";
import type { DemoAgent } from "@/lib/demo/agents";
import { mulberry32, hashString } from "@/lib/demo/prng";
import type { LeashUsage } from "./agent-leash";
import type { StrategyView } from "./agent-strategy";
import type { DecisionMark } from "./decision-map";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Shared helpers for the agent pages (league, profile, collection).
   Pure mappings from store shapes to the primitives' props, plus two
   tiny layout atoms (technical section, reveal). Nothing here is live.
------------------------------------------------------------------ */

/** Map a user seat's lifecycle status onto the operator state vocabulary. */
export function seatState(status: AgentStatus): AgentState {
  switch (status) {
    case "active": return "observing";
    case "paused": return "paused";
    case "pending-approval": return "waiting";
    case "stopped": return "stopped";
  }
}

/** Fallback state for a demo agent before the network has started. */
export function demoFallbackState(status: DemoAgent["status"]): AgentState {
  return status === "active" ? "observing" : status === "paused" ? "paused" : "sleeping";
}

/** Consistency: share of rounds inside limits over the agent's observed rounds. Never money. */
export function consistencyOf(d: Pick<DemoAgent, "roundsInsideLimits" | "disciplineStreak">) {
  return Math.round((d.roundsInsideLimits / (d.roundsInsideLimits + d.disciplineStreak + 1)) * 100);
}

/** IF / THEN / SIZE / EVERY for a demo agent (seats use describeRules). */
export function demoStrategy(d: DemoAgent): StrategyView {
  const when = d.cadence === "after-loss" ? "previous round was a loss" : d.cadence === "every-other" ? "every other round" : "every round";
  return {
    when,
    then: `bet ${d.bets.map((b) => b.label).join(" + ")}`,
    size: `${d.bets.reduce((s, b) => s + b.stake, 0)} chips`,
    cadence: d.cadence.replace("-", " "),
  };
}

/** Highest leash utilisation across the consumable limits (loss, rounds, time), as a percentage. Chips is a remaining balance, not usage. */
export function leashPct(u: LeashUsage) {
  const f = [u.loss / u.lossMax, u.rounds / u.roundsMax, u.minutes / u.minutesMax].map((x) => (Number.isFinite(x) ? Math.max(0, x) : 0));
  return Math.min(100, Math.max(...f) * 100);
}

/** Static leash usage for a demo agent when the network has no entry yet. */
export function demoLeash(d: DemoAgent): LeashUsage {
  const r = mulberry32(hashString(`${d.id}-leash`));
  const chipsMax = d.stopLoss * 4;
  return {
    chips: Math.floor(chipsMax * (0.3 + r() * 0.5)), chipsMax,
    loss: Math.floor(d.stopLoss * r() * 0.6), lossMax: d.stopLoss,
    rounds: Math.floor(d.maxRounds * r() * 0.6), roundsMax: d.maxRounds,
    minutes: Math.floor(d.timeLimitMinutes * r() * 0.5), minutesMax: d.timeLimitMinutes,
  };
}

/** Deterministic ~80-mark decision map for a demo agent. */
export function demoDecisionMarks(id: string, status: DemoAgent["status"], n = 80): DecisionMark[] {
  const r = mulberry32(hashString(id));
  const marks: DecisionMark[] = Array.from({ length: n }, () => {
    const x = r();
    return x < 0.42 ? "skipped" : x < 0.82 ? "executed" : "collected";
  });
  if (status === "stopped") marks[marks.length - 1] = "stopped";
  return marks;
}

/** Wall clock that refreshes on an interval, so elapsed-time maths stays out of render. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), every); return () => clearInterval(id); }, [every]);
  return now;
}

/** YYYY-MM-DD HH:MM in local time, for mono table cells. */
export function fmtStamp(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Technical section: ink rule on top, numbered microlabel title, corner metadata. */
export function TechSection({ index, title, meta, children, className, rule = "ink", id }: { index?: string; title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string; rule?: "ink" | "hairline"; id?: string }) {
  return (
    <section id={id} className={cn("border-t pt-3", rule === "ink" ? "border-ink" : "border-hairline", className)} aria-label={title}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="microlabel !text-ink flex items-baseline gap-3">
          {index && <span className="text-faint">{index}</span>}
          <span>{title}</span>
        </h2>
        {meta && <div className="microlabel text-right">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

/** Subtle reveal; respects reduced motion. */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Large serif figure with a microlabel; the summary-strip atom. */
export function Figure({ label, value, note, className }: { label: string; value: React.ReactNode; note?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="microlabel">{label}</dt>
      <dd className="mt-1 font-display text-4xl tnum md:text-5xl">{value}</dd>
      {note && <dd className="microlabel mt-1 !text-faint">{note}</dd>}
    </div>
  );
}
