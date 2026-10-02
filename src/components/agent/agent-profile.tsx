"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAgentSeats, describeRules } from "@/store/agent-seat";
import { useStable } from "@/store/stable";
import { useCollection, type Acquisition } from "@/store/collection";
import { useAgentNetwork } from "@/store/agent-network";
import { getDemoAgent, getDemoAgents } from "@/lib/demo/agents";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useWallet } from "@/store/wallet";
import { agentCode, STRATEGY_CLASSES, type AgentState, type StrategyClass } from "@/lib/agent/states";
import { Button } from "@/components/ui/button";
import { AgentGlyph } from "./agent-glyph";
import { AgentStatus } from "./agent-status";
import { AgentLeash, type LeashUsage } from "./agent-leash";
import { AgentStrategy, type StrategyView } from "./agent-strategy";
import { AgentRunSummary } from "./agent-run-summary";
import { AgentCollectionEvent } from "./agent-collection-event";
import { AgentDecisionTrace, type DecisionTrace } from "./agent-decision-trace";
import { AgentActivityFeed } from "./agent-activity-feed";
import { DecisionMap, type DecisionMark } from "./decision-map";
import { TechSection, Reveal, demoDecisionMarks, demoFallbackState, demoLeash, demoStrategy, fmtStamp, seatState, useNow } from "./agent-page-kit";
import { cn, formatNumber, formatUsd, shortAddress } from "@/lib/utils";

/* ------------------------------------------------------------------
   Agent profile: a terminal page for one machine. Thesis, leash, current
   run, collection, decision history, table activity, decision map.
   User seats resolve from the seat store (privacy rule intact); anything
   else resolves to a DEMO agent fed by the scripted network.
------------------------------------------------------------------ */

interface View {
  id: string;
  code: string;
  name: string;
  strategyClass: StrategyClass;
  thesis: string;
  ownerLabel: string;
  ownerHref: string;
  tableId: string;
  state: AgentState;
  stoppedReason: string | null;
  strategy: StrategyView;
  leash: LeashUsage;
  run: { rounds: number; decisions: number; skips: number; collections: number };
  followers: number;
  createdAt: number;
  approvedAt: number | null;
  net: number | null;
  allowance: number | null;
  stopLoss: number;
  stopWin: number | null;
  maxRounds: number;
  timeLimitMinutes: number;
  draft: { betId: string; stake: number; cadence: string };
  acquisitions: Acquisition[];
  demoCollection: Array<{ symbol: string; usd: number; count: number }>;
  traces: DecisionTrace[];
  marks: DecisionMark[];
  demo: boolean;
}

export function AgentProfile({ id }: { id: string }) {
  const mounted = useMounted();
  const router = useRouter();
  const now = useNow();
  const seat = useAgentSeats((s) => s.seats[id]);
  const acqs = useCollection((s) => s.acquisitions);
  const following = useStable((s) => s.following.includes(id));
  const toggle = useStable((s) => s.toggle);
  const setDraft = useStable((s) => s.setDraft);
  const net = useAgentNetwork((s) => s.agents.find((a) => a.id === id));
  const wallet = useWallet();
  const [showAll, setShowAll] = useState(false);

  const isOwner = !!wallet.address && seat?.owner === wallet.address;
  const canSeeSeat = !!seat && (seat.isPublic || isOwner || seat.owner === "practice");

  const v = useMemo<View | null>(() => {
    if (!mounted) return null;
    if (seat && canSeeSeat) {
      const mine = acqs.filter((a) => a.agentId === seat.id);
      const loss = Math.max(0, -seat.net);
      const marks: DecisionMark[] = [];
      for (const l of seat.log) {
        if (l.kind === "skip") marks.push("skipped");
        else if (l.kind === "bet") marks.push("executed");
        else if (l.kind === "result" && (l.delta ?? 0) > 0) marks.push("collected");
        else if (l.kind === "stopped") marks.push("stopped");
      }
      return {
        id: seat.id, code: seat.code, name: seat.name, strategyClass: seat.strategyClass, thesis: seat.thesis,
        ownerLabel: seat.owner === "practice" ? "you (practice)" : shortAddress(seat.owner), ownerHref: seat.owner === "practice" ? "/play/practice" : `/player/${seat.owner}`,
        tableId: seat.tableId, state: seatState(seat.status), stoppedReason: seat.stoppedReason,
        strategy: describeRules(seat.rules),
        leash: { chips: seat.allowance - loss, chipsMax: seat.allowance, loss, lossMax: seat.rules.stopLoss, rounds: seat.roundsPlayed, roundsMax: seat.rules.maxRounds, minutes: seat.approvedAt ? (now - seat.approvedAt) / 60_000 : 0, minutesMax: seat.rules.timeLimitMinutes },
        run: { rounds: seat.roundsPlayed, decisions: seat.decisions, skips: seat.skips, collections: mine.length },
        followers: seat.followers, createdAt: seat.createdAt, approvedAt: seat.approvedAt, net: seat.net, allowance: seat.allowance,
        stopLoss: seat.rules.stopLoss, stopWin: seat.rules.stopWin, maxRounds: seat.rules.maxRounds, timeLimitMinutes: seat.rules.timeLimitMinutes,
        draft: { betId: seat.rules.bets[0].betId, stake: seat.rules.bets[0].stake, cadence: seat.rules.cadence },
        acquisitions: mine, demoCollection: [], traces: [...seat.traces].reverse(), marks, demo: false,
      };
    }
    const d = getDemoAgent(id);
    if (!d) return null;
    const idx = getDemoAgents().findIndex((x) => x.id === d.id);
    const state = net?.state ?? demoFallbackState(d.status);
    const leash = net?.leash ?? demoLeash(d);
    const stoppedReason = state === "stopped" ? (leash.rounds >= leash.roundsMax ? "Round cap reached" : "Stop loss hit") : null;
    return {
      id: d.id, code: net?.code ?? agentCode(d.id), name: d.name, strategyClass: net?.strategyClass ?? STRATEGY_CLASSES[idx % STRATEGY_CLASSES.length], thesis: d.thesis,
      ownerLabel: d.owner.name, ownerHref: `/player/${d.owner.wallet}`, tableId: d.tableId, state, stoppedReason,
      strategy: demoStrategy(d), leash,
      run: { rounds: net?.rounds ?? Math.floor(d.roundsInsideLimits * 0.3), decisions: net?.decisions ?? Math.floor(d.roundsInsideLimits * 0.2), skips: net?.skips ?? Math.floor(d.roundsInsideLimits * 0.1), collections: d.collection.reduce((s, c) => s + c.count, 0) },
      followers: d.followers, createdAt: d.createdAt, approvedAt: d.createdAt, net: null, allowance: null,
      stopLoss: d.stopLoss, stopWin: d.stopWin, maxRounds: d.maxRounds, timeLimitMinutes: d.timeLimitMinutes,
      draft: { betId: d.bets[0].betId, stake: d.bets[0].stake, cadence: d.cadence },
      acquisitions: [], demoCollection: d.collection, traces: [], marks: demoDecisionMarks(d.id, d.status), demo: true,
    };
  }, [mounted, seat, canSeeSeat, acqs, id, net, now]);

  if (!mounted) return <div className="container-edge py-24" aria-busy="true" />;

  if (!v) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <span className="microlabel mb-4">No signal</span>
        <h1 className="font-display text-display-md">No agent here.</h1>
        <p className="mt-4 max-w-md text-muted">This agent is private, was removed, or never existed.</p>
        <Button href="/agents" className="mt-8" variant="outline">See the league</Button>
      </div>
    );
  }

  const copyThesis = () => {
    setDraft({ name: `${v.name} (copy)`, betId: v.draft.betId, stake: v.draft.stake, cadence: v.draft.cadence, stopLoss: v.stopLoss, stopWin: v.stopWin, maxRounds: v.maxRounds, timeLimitMinutes: v.timeLimitMinutes });
    router.push("/play/quick");
  };
  const collectedUsd = v.demo ? v.demoCollection.reduce((s, c) => s + c.usd, 0) : v.acquisitions.reduce((s, a) => s + a.usd, 0);
  const visibleTraces = showAll ? v.traces : v.traces.slice(0, 4);

  return (
    <div className="pb-24">
      {/* Masthead with corner metadata */}
      <header className="container-edge pt-10 md:pt-16">
        <div className="flex items-center justify-between border-b border-hairline pb-3 microlabel">
          <span><Link href="/agents" className="hover:underline">Agent league</Link> / {v.code}</span>
          <span>Table <Link href={`/table/${v.tableId}`} className="text-ink hover:underline">{v.tableId}</Link></span>
        </div>

        <div className="grid gap-8 py-10 md:grid-cols-12 md:py-14">
          <div className="md:col-span-2">
            <AgentGlyph seed={v.id} state={v.state} size={96} className="text-ink" title={`${v.code} glyph`} />
          </div>
          <div className="md:col-span-7">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-mono text-[13px] uppercase tracking-[0.08em]">{v.code}</span>
              <span className="microlabel">{v.strategyClass}</span>
              <AgentStatus state={v.state} long />
            </div>
            <h1 className="mt-4 font-display text-display-lg leading-none">{v.name}</h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">{v.thesis || <span className="text-muted">No thesis written.</span>}</p>
            <p className="mt-3 text-[13px] text-muted">
              Authored by <Link href={v.ownerHref} className="text-ink underline-offset-4 hover:underline">{v.ownerLabel}</Link>
              <span className="mx-2 text-faint">·</span>
              <span className="font-mono text-[12px] tnum">{v.followers + (following ? 1 : 0)}</span> followers
              {v.stoppedReason && <><span className="mx-2 text-faint">·</span><span className="text-ink">{v.stoppedReason}</span></>}
            </p>
          </div>
          <div className="flex items-start gap-3 md:col-span-3 md:justify-end">
            <Button variant={following ? "outline" : "primary"} size="sm" onClick={() => toggle(v.id)} aria-pressed={following} className="font-mono text-[11px] uppercase tracking-[0.12em]">{following ? "Following" : "Follow"}</Button>
            <Button variant="outline" size="sm" onClick={copyThesis} className="font-mono text-[11px] uppercase tracking-[0.12em]">Copy thesis</Button>
          </div>
        </div>
      </header>

      {/* Technical sections */}
      <div className="container-edge space-y-14">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <Reveal className="lg:col-span-5">
            <TechSection index="01" title="Thesis" meta={<>Cadence · {v.strategy.cadence}</>}>
              <AgentStrategy s={v.strategy} sentence={v.thesis || undefined} />
            </TechSection>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.05}>
            <TechSection index="02" title="Leash" meta={<>Stop-loss {formatNumber(v.stopLoss)} · {v.stopWin != null ? `stop-win ${formatNumber(v.stopWin)}` : "no stop-win"} · ≤{v.maxRounds} rounds · {v.timeLimitMinutes} min</>}>
              <AgentLeash usage={v.leash} size={176} triggered={v.state === "stopped" ? v.stoppedReason : null} />
              <p className="mt-5 border-t border-hairline pt-3 text-[12px] leading-relaxed text-muted">Four hard limits set by the author. The agent checks every one before each decision and stops itself the moment any is reached. Amber past 80 percent; black when hit.</p>
            </TechSection>
          </Reveal>
        </div>

        <Reveal>
          <TechSection index="03" title="Current run" meta={<>{v.approvedAt ? `Since ${fmtStamp(v.approvedAt)}` : "Awaiting approval"}{v.allowance != null && ` · allowance ${formatNumber(v.allowance)} chips`}</>}>
            <div className="grid gap-8 md:grid-cols-12 md:items-end">
              <AgentRunSummary rounds={v.run.rounds} decisions={v.run.decisions} skips={v.run.skips} collections={v.run.collections} className="md:col-span-8" />
              <dl className="grid grid-cols-2 gap-4 md:col-span-4">
                <div><dt className="microlabel">Collected value</dt><dd className="font-display text-3xl tnum">{formatUsd(collectedUsd)}</dd></div>
                <div><dt className="microlabel">{v.net != null ? "Net chips" : "Table"}</dt><dd className={cn("font-display text-3xl tnum", v.net != null && v.net < 0 && "text-casino-red")}>{v.net != null ? `${v.net >= 0 ? "+" : ""}${formatNumber(v.net)}` : v.tableId}</dd></div>
              </dl>
            </div>
          </TechSection>
        </Reveal>

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <Reveal className="lg:col-span-5">
            <TechSection index="04" title="Collection" meta={v.demo ? "Settled at claim" : `${v.acquisitions.length} acquisitions`}>
              {v.demo ? (
                v.demoCollection.length === 0 ? <p className="text-[13px] text-muted">Nothing collected yet.</p> : (
                  <ul className="divide-y divide-hairline">
                    {v.demoCollection.map((c) => (
                      <li key={c.symbol} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 py-2.5">
                        <span className="text-[14px] font-medium">{c.symbol}</span>
                        <span className="font-mono text-[12px] tnum text-muted">{c.count} ×</span>
                        <span className="font-mono text-[12.5px] tnum">{formatUsd(c.usd)}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : v.acquisitions.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing collected yet. Wins settle into the owner&apos;s chosen asset and appear here with their round.</p>
              ) : (
                <ol className="divide-y divide-hairline">
                  {v.acquisitions.slice(0, 12).map((a) => (
                    <li key={a.id}><AgentCollectionEvent agentName={a.agentName} agentId={a.agentId} roundId={a.roundId} result={a.result} chips={a.chips} usd={a.usd} symbol={a.symbol} status={a.status} /></li>
                  ))}
                </ol>
              )}
              <p className="mt-5 border-t border-hairline pt-3 text-[12px] leading-relaxed text-muted">Agents never influence outcomes and cannot change the odds. The wheel keeps its edge on every chip. What an agent collects is simply what its author walked away with.</p>
            </TechSection>
          </Reveal>

          <Reveal className="lg:col-span-7" delay={0.05}>
            <TechSection index="05" title="Decision history" meta={v.demo ? "Network telemetry" : `${v.traces.length} traces · newest first`}>
              {v.demo ? (
                <>
                  <p className="mb-4 text-[13px] text-muted">Structured decision traces are kept for agents you author. For this machine, the network telemetry below is what the table sees.</p>
                  <AgentActivityFeed agentId={v.id} limit={12} newestFirst title={null} />
                </>
              ) : v.traces.length === 0 ? (
                <p className="text-[13px] text-muted">No decisions yet. Once approved, every decision is traced here: rule, input, condition, leash check, wager and result.</p>
              ) : (
                <>
                  <ol className="space-y-2">
                    {visibleTraces.map((t, i) => (
                      <li key={`${t.roundId}-${t.at}`}>
                        <details open={i < 2} className="group">
                          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 border-t border-hairline py-2 text-[12.5px] [&::-webkit-details-marker]:hidden">
                            <span className="flex items-baseline gap-3">
                              <span className="font-mono text-[11px] tnum text-faint">{fmtStamp(t.at).slice(11)}</span>
                              <span className="font-medium text-ink">{t.decision}</span>
                              <span className="text-muted">{t.leash === "fail" ? "Leash check failed" : t.condition === false ? "Condition false" : t.leash === "pass" ? "Leash check passed" : ""}</span>
                            </span>
                            <span className="flex items-center gap-3 font-mono text-[11px] tnum text-muted">Round #{t.roundId}<span className="transition-transform group-open:rotate-90" aria-hidden>›</span></span>
                          </summary>
                          <AgentDecisionTrace trace={t} compact className="mb-3" />
                        </details>
                      </li>
                    ))}
                  </ol>
                  {v.traces.length > 4 && (
                    <button type="button" onClick={() => setShowAll((x) => !x)} className="mt-3 microlabel !text-ink underline-offset-4 hover:underline">{showAll ? "Show fewer" : `Show all ${v.traces.length} traces`}</button>
                  )}
                </>
              )}
            </TechSection>
          </Reveal>
        </div>

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <Reveal className="lg:col-span-5">
            <TechSection index="06" title="Table activity" meta={<>{v.tableId}</>}>
              <AgentActivityFeed tableId={v.tableId} compact limit={10} newestFirst title={null} />
            </TechSection>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.05}>
            <TechSection index="07" title="Decision map" meta={<>{v.marks.length} marks</>}>
              {v.marks.length === 0 ? <p className="text-[13px] text-muted">The map fills in as the agent observes, skips and executes.</p> : <DecisionMap marks={v.marks} cols={20} />}
            </TechSection>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
