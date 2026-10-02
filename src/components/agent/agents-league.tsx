"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { getDemoAgents, type DemoAgent } from "@/lib/demo/agents";
import { useStable } from "@/store/stable";
import { useAgentSeats } from "@/store/agent-seat";
import { useAgentNetwork, type NetAgent } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { agentCode, STRATEGY_CLASSES, type AgentState } from "@/lib/agent/states";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { AgentGlyph } from "./agent-glyph";
import { AgentStatus } from "./agent-status";
import { AgentMiniCard } from "./agent-mini-card";
import { AgentActivityFeed } from "./agent-activity-feed";
import { consistencyOf, demoFallbackState, leashPct, seatState, Reveal, useNow } from "./agent-page-kit";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   AGENT LEAGUE. Machines ranked on discipline, not spend. Every metric is
   behavioural (streaks, diversity, followers, run length, consistency);
   nothing here rewards money wagered or lost. All league data is DEMO.
------------------------------------------------------------------ */

type Metric = "discipline" | "diversity" | "followers" | "longest-run" | "consistency";

const METRICS: Array<{ key: Metric; label: string; short: string; hint: string; value: (a: DemoAgent) => number; format?: (n: number) => string }> = [
  { key: "discipline", label: "Discipline", short: "Streak", hint: "Consecutive rounds completed inside limits", value: (a) => a.disciplineStreak },
  { key: "diversity", label: "Collection diversity", short: "Assets", hint: "Distinct assets collected", value: (a) => a.collection.length },
  { key: "followers", label: "Followers", short: "Followers", hint: "People following this agent", value: (a) => a.followers },
  { key: "longest-run", label: "Longest run", short: "Run", hint: "Most rounds in a single approved session", value: (a) => a.longestRun },
  { key: "consistency", label: "Consistency", short: "Consist.", hint: "Share of observed rounds completed inside limits", value: consistencyOf, format: (n) => `${n}%` },
];

const fmt = (m: (typeof METRICS)[number], n: number) => (m.format ? m.format(n) : String(n));

export function AgentsLeague() {
  const [metric, setMetric] = useState<Metric>("discipline");
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const now = useNow();
  const following = useStable((s) => s.following);
  const toggle = useStable((s) => s.toggle);
  const seats = useAgentSeats((s) => s.seats);
  const netAgents = useAgentNetwork((s) => s.agents);

  const agents = useMemo(() => getDemoAgents(), []);
  const netById = useMemo(() => Object.fromEntries(netAgents.map((a) => [a.id, a])) as Record<string, NetAgent>, [netAgents]);
  const mine = mounted ? Object.values(seats) : [];
  const stable = mounted ? agents.filter((a) => following.includes(a.id)) : [];
  const active = METRICS.find((m) => m.key === metric)!;
  const rows = useMemo(
    () => agents.map((a) => ({ agent: a, value: active.value(a) })).filter((r) => r.value > 0).sort((x, y) => y.value - x.value || x.agent.name.localeCompare(y.agent.name)).map((r, i) => ({ ...r, rank: i + 1 })),
    [agents, active],
  );
  const netActive = netAgents.filter((a) => a.state !== "paused" && a.state !== "sleeping" && a.state !== "stopped").length;
  const seated = (mounted && netAgents.length ? netActive : agents.filter((a) => a.status === "active").length) + mine.filter((s) => s.status === "active").length;

  const stateOf = (a: DemoAgent): AgentState => netById[a.id]?.state ?? demoFallbackState(a.status);
  const codeOf = (a: DemoAgent) => netById[a.id]?.code ?? agentCode(a.id);
  const classOf = (a: DemoAgent, i: number) => netById[a.id]?.strategyClass ?? STRATEGY_CLASSES[i % STRATEGY_CLASSES.length];
  const indexOf = (a: DemoAgent) => agents.indexOf(a);

  return (
    <div className="pb-24">
      {/* Masthead */}
      <header className="container-edge pt-10 md:pt-16">
        <div className="flex items-center justify-between border-b border-hairline pb-3 microlabel">
          <span>Agent league · demo</span>
          <span className="inline-flex items-center gap-2"><span className="live-dot" aria-hidden />{seated} agents seated right now</span>
        </div>
        <div className="grid gap-8 py-10 md:grid-cols-12 md:items-end md:py-14">
          <div className="md:col-span-8">
            <Eyebrow className="mb-5 block">Agent league</Eyebrow>
            <h1 className="font-display text-display-lg text-balance">Machines ranked on discipline, not spend.</h1>
          </div>
          <div className="md:col-span-4 md:pb-1">
            <p className="max-w-sm text-[15px] leading-relaxed text-muted">Every agent here was written by a person: a thesis, a stake, a hard stop. Rankings reward keeping inside limits and collecting across assets. They never reward chips wagered or lost, and nothing here changes the odds.</p>
            <div className="mt-6 flex items-center gap-4">
              <Button href="/agents/new" variant="accent">Author an agent</Button>
              <span className="microlabel">Approval required before live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Metric tabs: a technical strip */}
      <div className="border-y border-ink">
        <div className="container-edge">
          <div role="tablist" aria-label="League metric" className="no-scrollbar -mx-4 flex overflow-x-auto px-4 md:mx-0 md:px-0">
            {METRICS.map((m) => {
              const on = m.key === metric;
              return (
                <button key={m.key} role="tab" aria-selected={on} onClick={() => setMetric(m.key)} className={cn("relative shrink-0 py-3 pr-8 text-left font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors md:pr-12", on ? "text-ink" : "text-muted hover:text-ink")}>
                  {m.label}
                  {on && <motion.span layoutId="league-tab" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-x-0 -bottom-px h-[2px] bg-ink" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* League grid: edge to edge, hairline rows */}
      <section aria-label="League table" className="border-b border-hairline">
        <div className="container-edge">
          <div className="flex items-baseline justify-between py-3 microlabel">
            <span>{active.hint}</span>
            <span className="hidden sm:inline">Ranked by {active.label.toLowerCase()} · {rows.length} agents</span>
          </div>
          <div className="hidden grid-cols-[40px_minmax(0,1.6fr)_minmax(0,1fr)_repeat(5,78px)_96px] items-center gap-x-4 border-t border-hairline py-2 microlabel md:grid">
            <span>#</span><span>Agent</span><span>Class</span>
            {METRICS.map((m) => <span key={m.key} className={cn("text-right", m.key === metric && "!text-ink")}>{m.short}</span>)}
            <span className="text-right">State</span>
          </div>
          <ol className="divide-y divide-hairline border-t border-hairline">
            {rows.map(({ agent, value, rank }, i) => {
              const st = stateOf(agent);
              return (
                <li key={agent.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 py-3 md:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,1fr)_repeat(5,78px)_96px] md:gap-x-4">
                  <span className={cn("font-mono text-[12px] tnum", rank <= 3 ? "text-ink" : "text-faint")}>{String(rank).padStart(2, "0")}</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <AgentGlyph seed={agent.id} state={st} size={28} className="text-ink" />
                    <div className="min-w-0">
                      <Link href={`/agent/${agent.id}`} className="block truncate hover:underline">
                        <span className="font-mono text-[12px] uppercase tracking-[0.06em]">{codeOf(agent)}</span>
                        <span className="ml-2 text-[13px] text-ink-2">{agent.name}</span>
                      </Link>
                      <div className="truncate text-[11px] text-muted md:hidden">{classOf(agent, indexOf(agent))} · {agent.tableId}</div>
                    </div>
                  </div>
                  <span className="hidden truncate text-[12px] text-muted md:block">{classOf(agent, indexOf(agent))}</span>
                  {METRICS.map((m) => {
                    const on = m.key === metric;
                    return (
                      <span key={m.key} className={cn("text-right font-mono tnum", on ? "text-[13px] text-ink" : "hidden text-[12px] text-muted md:block")}>
                        {on ? fmt(m, value) : fmt(m, m.value(agent))}
                      </span>
                    );
                  })}
                  <span className="hidden justify-end md:flex"><AgentStatus state={st} /></span>
                  {i === 0 && <span className="sr-only">Leader</span>}
                </li>
              );
            })}
          </ol>
          <p className="py-3 microlabel">Every agent carries a mandatory stop-loss, round cap and time limit set by its author.</p>
        </div>
      </section>

      {/* Body: stable + all agents, with a live feed in the side column */}
      <div className="container-edge mt-16 grid gap-16 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
        <div className="min-w-0 space-y-16">
          {/* Your stable */}
          <Reveal>
            <section aria-label="Your stable" className="border-t border-ink pt-3">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="microlabel !text-ink">01 · Your stable</h2>
                <span className="microlabel">{stable.length + mine.length} agents</span>
              </div>
              {stable.length === 0 && mine.length === 0 ? (
                <div className="border border-dashed border-border-strong px-6 py-10 text-center">
                  <p className="font-display text-2xl">No machines in your stable yet.</p>
                  <p className="mt-2 text-[13px] text-muted">Follow agents below, or <Link href="/agents/new" className="text-ink underline underline-offset-4">author your own</Link>.</p>
                </div>
              ) : (
                <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  {mine.map((s) => {
                    const usage = { chips: s.allowance - Math.max(0, -s.net), chipsMax: s.allowance, loss: Math.max(0, -s.net), lossMax: s.rules.stopLoss, rounds: s.roundsPlayed, roundsMax: s.rules.maxRounds, minutes: s.approvedAt ? (now - s.approvedAt) / 60_000 : 0, minutesMax: s.rules.timeLimitMinutes };
                    return (
                      <li key={s.id}>
                        <AgentMiniCard id={s.id} code={s.code} name={s.name} strategyClass={s.strategyClass} state={seatState(s.status)} href={`/agent/${s.id}`} leashPct={leashPct(usage)} meta={[["Rounds", String(s.roundsPlayed)], ["Decisions", String(s.decisions)], ["Skips", String(s.skips)]]} />
                      </li>
                    );
                  })}
                  {stable.map((a) => (
                    <li key={a.id}>
                      <AgentMiniCard
                        id={a.id} code={codeOf(a)} name={a.name} strategyClass={classOf(a, indexOf(a))} state={stateOf(a)}
                        meta={[["Streak", String(a.disciplineStreak)], ["Assets", String(a.collection.length)], ["Followers", String(a.followers + 1)]]}
                        action={<CardActions id={a.id} following onToggle={() => toggle(a.id)} />}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>

          {/* All agents */}
          <Reveal>
            <section aria-label="All agents" className="border-t border-ink pt-3">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="microlabel !text-ink">02 · All agents</h2>
                <span className="microlabel">{agents.length} machines · demo</span>
              </div>
              <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                {agents.map((a, i) => {
                  const fol = mounted && following.includes(a.id);
                  return (
                    <li key={a.id}>
                      <AgentMiniCard
                        id={a.id} code={codeOf(a)} name={a.name} strategyClass={classOf(a, i)} state={stateOf(a)}
                        meta={[["Streak", String(a.disciplineStreak)], ["Assets", String(a.collection.length)], ["Followers", String(a.followers + (fol ? 1 : 0))]]}
                        action={<CardActions id={a.id} following={fol} onToggle={() => toggle(a.id)} />}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          </Reveal>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-28 border-t border-ink pt-3">
            <AgentActivityFeed limit={10} newestFirst title="Network activity" className="max-h-[70vh]" />
            <p className="mt-4 border-t border-hairline pt-3 microlabel">Scripted demo telemetry. No live funds move.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CardActions({ id, following, onToggle }: { id: string; following: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-hairline pt-3">
      <Link href={`/agent/${id}`} className="microlabel !text-ink hover:underline">Profile →</Link>
      <button type="button" onClick={onToggle} aria-pressed={following} className={cn("font-mono text-[10.5px] uppercase tracking-[0.14em] underline-offset-4 hover:underline", following ? "text-muted" : "text-ink")}>
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}
