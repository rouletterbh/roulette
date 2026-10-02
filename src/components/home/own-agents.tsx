"use client";

import Link from "next/link";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useOwnSeats } from "@/components/agent/use-own-seats";
import { seatLeash, seatState } from "@/components/agent/use-my-agent";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { AgentStatus } from "@/components/agent/agent-status";
import { AgentActivityFeed } from "@/components/agent/agent-activity-feed";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

/**
 * Agent sections of the homepage when demo mode is off. Only the viewer's own
 * seats (agent-seat store) are shown; with none, an honest empty state in the
 * same visual language and the existing "Author an agent" call to action.
 */
export function OwnAgentsEmpty({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-start justify-center border border-dashed border-border-strong px-6", compact ? "py-8" : "py-12", className)}>
      <span className="microlabel">No signal</span>
      <p className="font-display mt-2 text-2xl">No agents seated yet.</p>
      <p className="mt-2 max-w-sm text-[13px] text-muted">Write a thesis and a hard stop. After you approve it, your agent plays your seat and every decision is logged here.</p>
      <Button href="/agents/new" variant="accent" size="sm" className="mt-5">Author an agent</Button>
    </div>
  );
}

/** "You do not play every round. Your agents do." with the viewer's own machines. */
export function OwnAgentsSection() {
  const mounted = useMounted();
  const { seats } = useOwnSeats();
  const pick = mounted ? seats.slice(0, 3) : [];
  return (
    <section className="container-edge py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <Eyebrow className="mb-4 block">Your agents</Eyebrow>
          <h2 className="font-display text-display-md text-balance">You do not play every round.<br />Your agents do.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Machines at the table. Each one runs a thesis you wrote, inside limits you set, and logs every decision where you can read it.</p>
          <div className="mt-8 flex gap-3"><Button href="/agents/new" variant="accent">Build an agent</Button><Button href="/agents" variant="ghost">Your stable</Button></div>
          <AgentActivityFeed limit={8} compact className="mt-10 hidden max-h-[220px] lg:flex" title="Your telemetry" />
        </div>
        {!mounted ? (
          <ul className="grid gap-px border-y border-ink md:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className={cn("min-h-[260px] py-6 md:px-6 md:first:pl-0 md:last:pr-0", i > 0 && "border-t border-hairline md:border-l md:border-t-0")}>
                <div className="h-full animate-pulse bg-sunken/60" />
              </li>
            ))}
          </ul>
        ) : pick.length === 0 ? (
          <OwnAgentsEmpty className="min-h-[260px]" />
        ) : (
          <ul className="grid gap-px border-y border-ink md:grid-cols-3">
            {pick.map((s, i) => {
              const st = seatState(s);
              const leash = seatLeash(s);
              return (
                <li key={s.id} className={cn("flex min-h-[260px] flex-col justify-between py-6 md:px-6 md:first:pl-0 md:last:pr-0", i > 0 && "border-t border-hairline md:border-l md:border-t-0")}>
                  <div className="flex items-start justify-between">
                    <AgentGlyph seed={s.id} state={st} size={56} className="text-ink" />
                    <AgentStatus state={st} />
                  </div>
                  <div className="mt-6">
                    <Link href={`/agent/${s.id}`} className="font-mono text-[15px] uppercase tracking-[0.06em] hover:underline">{s.code}</Link>
                    <div className="microlabel mt-1">{s.strategyClass}</div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 font-mono text-[12px] tnum">
                      <div><dt className="microlabel">Rounds</dt><dd>{s.roundsPlayed}</dd></div>
                      <div><dt className="microlabel">Actions</dt><dd>{s.decisions}</dd></div>
                      <div><dt className="microlabel">Skips</dt><dd>{s.skips}</dd></div>
                    </dl>
                    <div className="mt-3 font-mono text-[12px] text-ink-2">
                      {s.status === "pending-approval" ? "Awaiting your approval" : s.status === "paused" ? "Paused by owner" : s.status === "stopped" ? (s.stoppedReason ?? "Stopped") : `Leash ${Math.round((leash.loss / Math.max(1, leash.lossMax)) * 100)}% · ${Math.max(0, leash.lossMax - leash.loss)} to stop loss`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** League teaser: the viewer's own agents ranked by rounds completed inside limits; never money. */
export function OwnLeagueTeaser() {
  const mounted = useMounted();
  const { seats } = useOwnSeats();
  const rows = mounted ? [...seats].sort((a, b) => b.roundsPlayed - a.roundsPlayed).slice(0, 5) : [];
  return (
    <section className="container-edge py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <div>
          <Eyebrow className="mb-4 block">League</Eyebrow>
          <h2 className="font-display text-display-md text-balance">Ranked on discipline.<br />Not spend.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Machines are ranked on how well they stayed inside their leash, how varied their collection is, and who follows them. Never on money lost.</p>
          <Button href="/agents" variant="outline" className="mt-8">Open the league</Button>
        </div>
        {!mounted ? (
          <div className="min-h-[200px] border-y border-ink" aria-busy="true" />
        ) : rows.length === 0 ? (
          <OwnAgentsEmpty />
        ) : (
          <ol className="divide-y divide-hairline border-y border-ink">
            {rows.map((s, i) => (
              <li key={s.id} className="grid grid-cols-[32px_40px_1fr_auto] items-center gap-4 py-3">
                <span className="font-display text-2xl tnum text-faint">{i + 1}</span>
                <AgentGlyph seed={s.id} state={seatState(s)} size={32} className="text-ink" />
                <div className="min-w-0"><Link href={`/agent/${s.id}`} className="font-mono text-[13px] uppercase tracking-[0.06em] hover:underline">{s.code}</Link><div className="truncate text-[12px] text-muted">{s.thesis || s.name}</div></div>
                <div className="text-right"><div className="microlabel">Rounds inside limits</div><div className="font-mono text-[14px] tnum">{s.roundsPlayed}</div></div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
