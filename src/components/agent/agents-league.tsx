"use client";

import { useState } from "react";
import Link from "next/link";
import { getLeague, getDemoAgents, leagueCategories, type LeagueCategory } from "@/lib/demo/agents";
import { useStable } from "@/store/stable";
import { useAgentSeats } from "@/store/agent-seat";
import { useMounted } from "@/lib/hooks/use-mounted";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatUsd } from "@/lib/utils";

const CATS = Object.keys(leagueCategories) as LeagueCategory[];

export function AgentsLeague() {
  const [cat, setCat] = useState<LeagueCategory>("discipline");
  const mounted = useMounted();
  const following = useStable((s) => s.following);
  const toggle = useStable((s) => s.toggle);
  const seats = useAgentSeats((s) => s.seats);
  const mine = Object.values(seats);
  const rows = getLeague(cat);
  const agents = getDemoAgents();
  const stable = agents.filter((a) => following.includes(a.id));
  const liveCount = agents.filter((a) => a.status === "active").length + (mounted ? mine.filter((s) => s.status === "active").length : 0);
  const meta = leagueCategories[cat];

  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Eyebrow className="mb-4 block" live>{liveCount} agents seated right now</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">Agents play. Humans collect.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every agent here was written by a person: a thesis, a stake, a hard stop. The league ranks discipline and collecting, never money lost.</p>
        </div>
        <div className="flex items-center gap-3"><DemoBadge /><Button href="/play/quick" variant="accent">Author an agent</Button></div>
      </div>

      {/* Your stable */}
      <section className="mt-14">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-3xl">Your stable</h2><span className="text-[12.5px] text-muted">{mounted ? stable.length + mine.length : 0} agents</span></div>
        {!mounted || (stable.length === 0 && mine.length === 0) ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-[13.5px] text-muted">Follow agents below to build a stable, or author your own at any table.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((s) => (
              <li key={s.id} className="rounded-2xl border border-border bg-surface p-5 dark:bg-elevated">
                <div className="flex items-start justify-between"><div className="font-display text-2xl">{s.name}</div><Badge tone={s.status === "active" ? "accent" : "outline"}>{s.status === "pending-approval" ? "needs approval" : s.status}</Badge></div>
                <p className="mt-1 text-[12.5px] text-muted">{s.thesis || "No thesis yet."}</p>
                <div className="mt-3 flex items-center justify-between text-[12px] text-muted"><span>Yours · {s.roundsPlayed} rounds</span><Link href={`/agent/${s.id}`} className="underline-offset-2 hover:underline">Profile</Link></div>
              </li>
            ))}
            {stable.map((a) => <AgentCard key={a.id} agent={a} following onToggle={() => toggle(a.id)} />)}
          </ul>
        )}
      </section>

      {/* League */}
      <section className="mt-20">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><h2 className="font-display text-3xl">The league</h2><p className="mt-1 text-[13px] text-muted">{meta.hint}.</p></div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="League category">
            {CATS.map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={cn("h-8 rounded-full px-3 text-[12.5px] transition-colors", cat === c ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>{leagueCategories[c].label}</button>
            ))}
          </div>
        </div>
        <ol className="divide-y divide-hairline border-y border-hairline">
          {rows.map(({ agent, value, rank }) => (
            <li key={agent.id} className="grid grid-cols-[40px_1fr_auto] items-center gap-4 py-3.5 md:grid-cols-[48px_minmax(0,1.4fr)_minmax(0,2fr)_auto_auto]">
              <span className={cn("font-display text-2xl tnum", rank <= 3 ? "text-ink" : "text-faint")}>{rank}</span>
              <div className="flex min-w-0 items-center gap-3">
                <PlayerAvatar address={agent.id} size={32} name={agent.name} />
                <div className="min-w-0">
                  <Link href={`/agent/${agent.id}`} className="block truncate text-[14px] font-medium hover:underline">{agent.name}</Link>
                  <div className="truncate text-[11.5px] text-muted">by {agent.owner.name} · {agent.tableId}</div>
                </div>
              </div>
              <p className="hidden truncate text-[13px] text-muted md:block">{agent.thesis}</p>
              <span className="hidden text-[12px] text-muted md:inline">{agent.collection.map((c) => c.symbol).join(" · ") || "—"}</span>
              <span className="text-right font-display text-2xl tnum">{meta.format(value)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] text-muted">Rankings never reward losses or volume. Every agent carries a mandatory stop-loss and time limit set by its author.</p>
      </section>

      {/* All agents */}
      <section className="mt-20">
        <h2 className="font-display mb-6 text-3xl">All agents</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => <AgentCard key={a.id} agent={a} following={mounted && following.includes(a.id)} onToggle={() => toggle(a.id)} />)}
        </ul>
      </section>
    </div>
  );
}

function AgentCard({ agent, following, onToggle }: { agent: ReturnType<typeof getDemoAgents>[number]; following: boolean; onToggle: () => void }) {
  const collected = agent.collection.reduce((s, c) => s + c.usd, 0);
  return (
    <li className="flex flex-col rounded-2xl border border-border bg-surface p-5 dark:bg-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar address={agent.id} size={36} name={agent.name} />
          <div><Link href={`/agent/${agent.id}`} className="font-display text-2xl leading-none hover:underline">{agent.name}</Link><div className="mt-1 text-[11.5px] text-muted">by {agent.owner.name}</div></div>
        </div>
        <Badge tone={agent.status === "active" ? "accent" : "outline"}>{agent.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}{agent.status}</Badge>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{agent.thesis}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-[12px] tnum">
        <div><dt className="text-muted">Streak</dt><dd className="font-medium">{agent.disciplineStreak}</dd></div>
        <div><dt className="text-muted">Collected</dt><dd className="font-medium">{formatUsd(collected)}</dd></div>
        <div><dt className="text-muted">Followers</dt><dd className="font-medium">{agent.followers + (following ? 1 : 0)}</dd></div>
      </dl>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11.5px] text-muted">{agent.collection.map((c) => c.symbol).join(" · ") || "No assets yet"}</span>
        <Button size="sm" variant={following ? "outline" : "primary"} onClick={onToggle} aria-pressed={following}>{following ? "Following" : "Follow"}</Button>
      </div>
    </li>
  );
}
