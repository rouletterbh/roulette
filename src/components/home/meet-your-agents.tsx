"use client";

import Link from "next/link";
import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { AgentStatus } from "@/components/agent/agent-status";
import { AgentActivityFeed } from "@/components/agent/agent-activity-feed";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { OwnAgentsSection } from "./own-agents";

/** "You do not play every round. Your agents do." Three machines operating at once. Demo off: the viewer's own seats. */
export function MeetYourAgents() {
  return siteConfig.demoMode ? <DemoMeetYourAgents /> : <OwnAgentsSection />;
}

function DemoMeetYourAgents() {
  const mounted = useMounted();
  const agents = useAgentNetwork((s) => s.agents);
  const pick = mounted ? [agents.find((a) => a.state !== "sleeping" && a.state !== "stopped") ?? agents[0], agents[2], agents[4]].filter(Boolean) : [];
  return (
    <section className="container-edge py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <Eyebrow className="mb-4 block">Agent network</Eyebrow>
          <h2 className="font-display text-display-md text-balance">You do not play every round.<br />Your agents do.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Machines at the table. Each one runs a thesis you wrote, inside limits you set, and logs every decision where you can read it.</p>
          <div className="mt-8 flex gap-3"><Button href="/agents/new" variant="accent">Build an agent</Button><Button href="/agents" variant="ghost">See the league</Button></div>
          <AgentActivityFeed limit={8} compact className="mt-10 hidden max-h-[220px] lg:flex" title="Live telemetry" />
        </div>
        <ul className="grid gap-px border-y border-ink md:grid-cols-3">
          {(pick.length ? pick : [null, null, null]).map((a, i) => (
            <li key={a?.id ?? i} className={cn("flex min-h-[260px] flex-col justify-between py-6 md:px-6 md:first:pl-0 md:last:pr-0", i > 0 && "border-t border-hairline md:border-l md:border-t-0")}>
              {a ? (
                <>
                  <div className="flex items-start justify-between">
                    <AgentGlyph seed={a.id} state={a.state} size={56} className="text-ink" />
                    <AgentStatus state={a.state} />
                  </div>
                  <div className="mt-6">
                    <Link href={`/agent/${a.id}`} className="font-mono text-[15px] uppercase tracking-[0.06em] hover:underline">{a.code}</Link>
                    <div className="microlabel mt-1">{a.strategyClass}</div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 font-mono text-[12px] tnum">
                      <div><dt className="microlabel">Rounds</dt><dd>{a.rounds}</dd></div>
                      <div><dt className="microlabel">Actions</dt><dd>{a.decisions}</dd></div>
                      <div><dt className="microlabel">Skips</dt><dd>{a.skips}</dd></div>
                    </dl>
                    <div className="mt-3 font-mono text-[12px] text-ink-2">
                      {a.state === "sleeping" ? "Starts: next session" : a.state === "paused" ? "Paused by owner" : a.lastBet && (a.state === "executing" || a.state === "locked" || a.state === "prepared") ? `Bet: ${a.lastBet.label} · ${a.lastBet.stake} chips` : `Leash ${Math.round((a.leash.loss / a.leash.lossMax) * 100)}% · ${Math.max(0, a.leash.lossMax - a.leash.loss)} to stop loss`}
                    </div>
                  </div>
                </>
              ) : <div className="h-full animate-pulse bg-sunken/60" />}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
