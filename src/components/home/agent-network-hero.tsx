"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RouletteWheel } from "@/components/roulette/roulette-wheel";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { AgentStatus } from "@/components/agent/agent-status";
import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { colorOf } from "@/lib/roulette/constants";
import type { AgentState } from "@/lib/agent/states";
import { cn } from "@/lib/utils";

/**
 * AgentNetwork hero: the table is alive. Four agent nodes around a real wheel,
 * thin traces, instrumentation, and a looping narrative that explains the
 * product without documentation: observe → match → leash → prepare → lock →
 * spin → result → collect. Results come from a fixed script (demo), never from
 * the animation.
 */
type Step = "observing" | "thinking" | "leash-check" | "prepared" | "locked" | "spin" | "settling" | "collected";
const SCRIPT: Array<{ step: Step; ms: number }> = [
  { step: "observing", ms: 2200 },
  { step: "thinking", ms: 1500 },
  { step: "leash-check", ms: 1300 },
  { step: "prepared", ms: 1600 },
  { step: "locked", ms: 1200 },
  { step: "spin", ms: 0 }, // ends when the wheel completes
  { step: "settling", ms: 1400 },
  { step: "collected", ms: 2600 },
];

const NODES = [
  { id: "demo-agent-1", code: "ARC-7", pos: "top", bet: { label: "17", stake: 2, betId: "straight:17" }, result: 17, input: "R R B R B", rule: "Red ≥ 3 in last 5", payout: "+70 chips" },
  { id: "demo-agent-3", code: "NOVA-21", pos: "right", bet: { label: "BLACK", stake: 2, betId: "black" }, result: 22, input: "R B R R B", rule: "Red ≥ 3 in last 5", payout: "+2 chips" },
  { id: "demo-agent-5", code: "ZERO-4", pos: "bottom", bet: { label: "1–18", stake: 1, betId: "low" }, result: 12, input: "H H H L H", rule: "High ≥ 4 in last 5", payout: "+1 chip" },
  { id: "demo-agent-8", code: "VEGA-19", pos: "left", bet: { label: "2nd 12", stake: 2, betId: "dozen:2" }, result: 15, input: "B B R B B", rule: "Black ≥ 4 in last 5", payout: "+4 chips" },
] as const;

const posClass: Record<string, string> = {
  top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
  right: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
  bottom: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2",
  left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
};
const anchor: Record<string, [number, number]> = { top: [50, 0], right: [100, 50], bottom: [50, 100], left: [0, 50] };

export function AgentNetworkHero() {
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const table = useAgentNetwork((s) => s.tables["neon-01"]);
  const summary = useAgentNetwork((s) => s.summary());
  const [featured, setFeatured] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [roundId, setRoundId] = useState(4821);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const node = NODES[featured];
  const step = SCRIPT[stepIdx].step;

  useEffect(() => {
    if (!mounted) return;
    if (reduce) return;
    const cur = SCRIPT[stepIdx];
    if (cur.step === "spin") {
      timer.current = setTimeout(() => setSpinning(true), 0);
      return () => { if (timer.current) clearTimeout(timer.current); };
    }
    timer.current = setTimeout(() => {
      if (stepIdx === SCRIPT.length - 1) {
        setFeatured((f) => (f + 1) % NODES.length);
        setStepIdx(0);
        setRoundId((r) => r + 1);
      } else setStepIdx(stepIdx + 1);
    }, cur.ms);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [stepIdx, mounted, reduce]);

  const onSpinComplete = () => {
    setSpinning(false);
    setLastResult(node.result);
    setStepIdx((i) => Math.min(SCRIPT.length - 1, i + 1));
  };

  const stateFor = (i: number): AgentState => {
    if (i !== featured) return i % 3 === 0 ? "waiting" : i % 3 === 1 ? "observing" : "paused";
    switch (step) {
      case "spin": return "locked";
      default: return step;
    }
  };

  const narrative: Record<Step, { title: string; detail: string }> = {
    observing: { title: "Observing table", detail: `Last 5: ${node.input}` },
    thinking: { title: "Pattern detected", detail: node.rule },
    "leash-check": { title: "Leash check", detail: "PASS · 18 chips to stop loss" },
    prepared: { title: "Bet prepared", detail: `${node.bet.stake} chips on ${node.bet.label}` },
    locked: { title: "Round locked", detail: "Commitment fixed before the spin" },
    spin: { title: "Wheel spinning", detail: "Result was committed. The wheel only replays it." },
    settling: { title: "Settling", detail: `Result ${node.result} ${colorOf(node.result).toUpperCase()}` },
    collected: { title: "Collected", detail: `${node.payout} → ${node.code === "ARC-7" ? "CASHCAT" : "win balance"}` },
  };

  const phase: "open" | "locked" | "settling" = step === "spin" || step === "locked" ? "locked" : step === "settling" || step === "collected" ? "settling" : "open";

  return (
    <div className="relative mx-auto w-full max-w-[1180px]">
      {/* instrumentation corners */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 hidden flex-col gap-1 md:flex">
        <Instrument k="Round" v={`#${roundId}`} />
        <Instrument k="Agents" v={`${mounted ? summary.active : 8} active`} />
        <Instrument k="Commitment" v={phase === "open" ? "published" : "locked"} />
      </div>
      <div className="pointer-events-none absolute right-0 top-0 z-20 hidden flex-col items-end gap-1 md:flex">
        <Instrument k="Treasury" v="safe" ok />
        <Instrument k="Exposure" v={`${(table?.exposurePct ?? 12.4).toFixed(1)}%`} />
        <Instrument k="Next round" v={step === "collected" ? "00:03" : phase === "open" ? "00:11" : "—"} />
      </div>

      <div className="relative mx-auto aspect-square w-[min(78vw,420px)] md:w-[520px]">
        {/* traces */}
        <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {NODES.map((n, i) => {
            const [x, y] = anchor[n.pos];
            const active = i === featured && (step === "prepared" || step === "locked" || step === "spin");
            return (
              <g key={n.id}>
                <line x1={x} y1={y} x2="50" y2="50" stroke="var(--border-strong)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" opacity={i === featured ? 0.9 : 0.35} />
                {active && <line x1={x} y1={y} x2="50" y2="50" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" className="trace-flow" />}
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-[10%] blueprint-radial rounded-full" aria-hidden />
        <div className="absolute inset-[14%]">
          <RouletteWheel result={spinning ? node.result : null} spinning={spinning} onComplete={onSpinComplete} restingResult={lastResult} reducedMotion={!!reduce} />
        </div>

        {/* agent nodes */}
        {NODES.map((n, i) => {
          const st = stateFor(i);
          const isF = i === featured;
          return (
            <div key={n.id} className={cn("absolute z-20 flex items-center gap-2 bg-canvas/90 px-2 py-1.5 backdrop-blur-[2px]", posClass[n.pos], (n.pos === "left" || n.pos === "right") && "hidden md:flex", n.pos === "right" && "flex-row-reverse text-right")}>
              <AgentGlyph seed={n.id} state={st} size={isF ? 40 : 32} className={cn("transition-all", isF ? "text-ink" : "text-muted")} />
              <div className="leading-tight">
                <div className={cn("font-mono text-[11px] uppercase tracking-[0.08em]", isF ? "text-ink" : "text-muted")}>{n.code}</div>
                <AgentStatus state={st} />
                {isF && (step === "prepared" || step === "locked" || step === "spin") && <div className="mt-0.5 font-mono text-[11px] text-ink">→ {n.bet.label} · {n.bet.stake}c</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* narrative */}
      <div className="mx-auto mt-6 w-full max-w-md md:absolute md:bottom-0 md:left-0 md:mt-0 md:w-[260px]">
        <div className="border-t border-ink pt-2">
          <div className="flex items-center justify-between"><span className="microlabel !text-ink">{node.code}</span><span className="microlabel">step {Math.min(stepIdx + 1, 8)} / 8</span></div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${featured}-${step}`} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.22 }} className="mt-1.5">
              <div className="text-[15px] font-medium">{narrative[step].title}</div>
              <div className="font-mono text-[12px] text-muted">{narrative[step].detail}</div>
            </motion.div>
          </AnimatePresence>
          <ol className="mt-3 flex gap-1" aria-hidden>
            {SCRIPT.map((s, i) => <li key={s.step} className={cn("h-px flex-1 transition-colors", i <= stepIdx ? "bg-ink" : "bg-hairline")} />)}
          </ol>
        </div>
      </div>
      <p className="mt-4 text-center microlabel md:absolute md:bottom-0 md:right-0 md:mt-0 md:text-right">results are committed before the wheel moves</p>
    </div>
  );
}

function Instrument({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      {ok && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      <span className="microlabel">{k}</span>
      <span className="font-mono text-[12px] tnum text-ink">{v}</span>
    </div>
  );
}
