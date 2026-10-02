"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AgentExecutionPath, type ExecutionStep } from "@/components/agent/agent-execution-path";
import { AgentDecisionTrace } from "@/components/agent/agent-decision-trace";
import { cn } from "@/lib/utils";

const STEPS: ExecutionStep[] = ["Observe", "Match rule", "Leash check", "Execute", "Settle", "Collect"];
const ROWS: Array<[ExecutionStep, string, string]> = [
  ["Observe", "Input", "R B R R B"],
  ["Match rule", "Thesis", "Red ≥ 3 in last 5 · MATCH YES"],
  ["Leash check", "Leash", "PASS · 4 chips max · 18 to stop loss"],
  ["Execute", "Action", "2 chips → BLACK"],
  ["Settle", "Result", "12 BLACK"],
  ["Collect", "Collected", "+2 chips → CASHCAT"],
];

/** "Every decision leaves a trace." Real telemetry shape, animated step by step. */
export function DecisionTraceSection() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((x) => (x + 1) % (STEPS.length + 1)), 1400);
    return () => clearInterval(id);
  }, [reduce]);
  const cur = reduce ? STEPS.length - 1 : Math.min(i, STEPS.length - 1);
  return (
    <section className="section-wash border-y border-hairline bg-sunken/40 dark:bg-elevated/30">
      <div className="container-edge grid gap-12 py-20 md:py-28 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
        <div>
          <Eyebrow className="mb-4 block">Decision trace</Eyebrow>
          <h2 className="font-display text-display-md text-balance">Every decision leaves a trace.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Nothing hidden. An agent is a rule, an input, a leash check and an action, in that order, and every round writes all four down.</p>
          <AgentExecutionPath current={STEPS[cur]} className="mt-10 flex-wrap gap-y-3" />
          <ol className="mt-8 divide-y divide-hairline border-t border-ink">
            {ROWS.map(([step, k, v], idx) => (
              <li key={k} className={cn("grid grid-cols-[110px_1fr] gap-4 py-2.5 transition-opacity duration-300", idx > cur ? "opacity-30" : "opacity-100")}>
                <span className="microlabel">{k}</span>
                <span className={cn("font-mono text-[13px]", idx === cur ? "text-ink" : "text-ink-2")}>{v}</span>
                <span className="sr-only">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="lg:pt-12">
          <AgentDecisionTrace trace={{ roundId: 4821, at: 0, decision: "BET BLACK", rule: "Red appeared 3 times in the last 5 rounds.", input: "R B R R B", condition: true, leash: "pass", leashNote: "18 chips to stop loss", maxAllowed: 4, wager: 2, commitment: "0x6d2b79f5a1c3e4b2d9f0a7c6b5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6", tx: "0x92f1c0ffee00", result: "BLACK 12", outcome: 2 }} />
          <p className="microlabel mt-4">Example round · structured summary, never an inner monologue</p>
        </div>
      </div>
    </section>
  );
}
