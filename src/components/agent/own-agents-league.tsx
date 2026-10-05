"use client";

import Link from "next/link";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useOwnSeats } from "./use-own-seats";
import { seatLeash, seatState } from "./use-my-agent";
import { leashPct, Reveal } from "./agent-page-kit";
import { AgentMiniCard } from "./agent-mini-card";
import { AgentActivityFeed } from "./agent-activity-feed";
import { AgentWalletsList } from "./chain-agent";
import { OwnAgentsEmpty } from "@/components/home/own-agents";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";

/**
 * /agents when demo mode is off. There is no on-chain registry of other people's
 * agents, so the page lists only the viewer's own seats (their stable) and their
 * telemetry. No ranked table of personas is shown.
 */
export function OwnAgentsLeague() {
  const mounted = useMounted();
  const { seats, summary } = useOwnSeats();
  return (
    <div className="pb-24">
      <header className="container-edge pt-10 md:pt-16">
        <div className="flex items-center justify-between border-b border-hairline pb-3 microlabel">
          <span>Agent league</span>
          <span className="inline-flex items-center gap-2"><span className="live-dot" aria-hidden />{mounted ? summary.seated : "—"} of your agents seated right now</span>
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

      <div className="container-edge mt-4 grid gap-16 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
        <div className="min-w-0 space-y-16">
          <Reveal>
            <section aria-label="Your stable" className="border-t border-ink pt-3">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="microlabel !text-ink">01 · Your stable</h2>
                <span className="microlabel">{mounted ? seats.length : "—"} agents</span>
              </div>
              {!mounted ? (
                <div className="min-h-[160px]" aria-busy="true" />
              ) : seats.length === 0 ? (
                <OwnAgentsEmpty />
              ) : (
                <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  {seats.map((s) => (
                    <li key={s.id}>
                      <AgentMiniCard id={s.id} code={s.code} name={s.name} strategyClass={s.strategyClass} state={seatState(s)} href={`/agent/${s.id}`} leashPct={leashPct(seatLeash(s))} meta={[["Rounds", String(s.roundsPlayed)], ["Decisions", String(s.decisions)], ["Skips", String(s.skips)]]} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>
          <Reveal>
            <section aria-label="Agent wallets" className="border-t border-ink pt-3">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="microlabel !text-ink">02 · Agent wallets</h2>
                <span className="microlabel">kept in this browser only</span>
              </div>
              <AgentWalletsList />
            </section>
          </Reveal>
          <Reveal>
            <section aria-label="Public league" className="border-t border-ink pt-3">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="microlabel !text-ink">03 · Public league</h2>
                <span className="microlabel">not yet open</span>
              </div>
              <p className="max-w-xl text-[13.5px] text-muted">
                A public ranking appears once agents authored by other people are published. Until then only your own machines are listed. Follow the <Link href="/treasury" className="text-ink underline underline-offset-4">treasury</Link> for live table limits.
              </p>
            </section>
          </Reveal>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-28 border-t border-ink pt-3">
            <AgentActivityFeed limit={10} newestFirst title="Your activity" className="max-h-[70vh]" />
          </div>
        </aside>
      </div>
    </div>
  );
}
