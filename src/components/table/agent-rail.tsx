"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAgentNetwork, type NetAgent } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useMyAgent, seatState } from "@/components/agent/use-my-agent";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { AgentStatus } from "@/components/agent/agent-status";
import { AgentLeash } from "@/components/agent/agent-leash";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { cn } from "@/lib/utils";

/**
 * AT THIS TABLE: agents operating alongside humans. Clicking an agent opens a
 * mini profile. When an agent acts, a subtle trace (code → bet) appears; no popups.
 */
export function AgentRail({ tableId, selfAddress, selfName, className, onHighlight }: { tableId: string; selfAddress: string; selfName: string; className?: string; onHighlight?: (betId: string | null) => void }) {
  const mounted = useMounted();
  const agents = useAgentNetwork((s) => s.agents);
  const events = useAgentNetwork((s) => s.events);
  const { seat } = useMyAgent();
  const [openId, setOpenId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const here = agents.filter((a) => a.tableId === tableId);
  const latest = events.length ? events[events.length - 1].at : 0;
  const recentActs = events.filter((e) => e.tableId === tableId && e.kind === "prepare" && latest - e.at < 6000).slice(-3);

  // hover → highlight the agent's bet region on the board (desktop only, restrained)
  useEffect(() => () => onHighlight?.(null), [onHighlight]);

  return (
    <div className={cn("", className)}>
      <div className="mb-3 flex items-center justify-between"><span className="microlabel !text-ink">At this table</span><span className="microlabel">{here.length} agents</span></div>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {seat && seat.tableId === tableId && (
          <li className="flex items-center gap-3 py-2.5">
            <AgentGlyph seed={seat.id} state={seatState(seat)} size={28} className="text-ink" />
            <div className="min-w-0 flex-1"><Link href={`/agent/${seat.id}`} className="font-mono text-[12px] uppercase tracking-[0.06em] hover:underline">{seat.code}</Link><div className="microlabel">yours</div></div>
            <AgentStatus state={seatState(seat)} />
          </li>
        )}
        {(mounted ? here : []).map((a) => (
          <li key={a.id} className="relative">
            <button
              type="button"
              onClick={() => setOpenId(openId === a.id ? null : a.id)}
              onMouseEnter={() => onHighlight?.(a.demo.bets[0]?.betId ?? null)}
              onMouseLeave={() => onHighlight?.(null)}
              aria-expanded={openId === a.id}
              className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-sunken/50 dark:hover:bg-elevated"
            >
              <AgentGlyph seed={a.id} state={a.state} size={28} className={a.state === "sleeping" || a.state === "paused" ? "text-faint" : "text-ink"} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] uppercase tracking-[0.06em]">{a.code}</div>
                <div className="microlabel truncate">{a.strategyClass}</div>
              </div>
              <AgentStatus state={a.state} />
            </button>
            <AnimatePresence>
              {openId === a.id && (
                <motion.div key="mini" initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduce ? undefined : { opacity: 0, height: 0 }} className="overflow-hidden">
                  <MiniProfile a={a} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
        <li className="flex items-center gap-3 py-2.5">
          <PlayerAvatar address={selfAddress} size={28} />
          <div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{selfName}</div><div className="microlabel">human · you</div></div>
        </li>
      </ul>

      {/* subtle action traces */}
      <div className="mt-3 min-h-[40px] space-y-1" aria-live="polite">
        <AnimatePresence>
          {recentActs.map((e) => (
            <motion.div key={e.id} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 font-mono text-[11.5px]">
              <span className="uppercase tracking-[0.06em] text-ink">{e.code}</span>
              <span className="h-px w-5 bg-accent trace-draw" aria-hidden />
              <span className="text-ink-2">{e.text.replace(/^Placed /, "").replace(/^Bet prepared: /, "")}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MiniProfile({ a }: { a: NetAgent }) {
  return (
    <div className="border-t border-hairline bg-sunken/40 px-2 pb-3 pt-3 text-[12px] dark:bg-elevated/40">
      <p className="text-ink-2">{a.demo.thesis}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <AgentLeash usage={a.leash} size={64} compact />
        <dl className="grid flex-1 grid-cols-3 gap-2 font-mono tnum">
          <div><dt className="microlabel">Rounds</dt><dd>{a.rounds}</dd></div>
          <div><dt className="microlabel">Decisions</dt><dd>{a.decisions}</dd></div>
          <div><dt className="microlabel">Skips</dt><dd>{a.skips}</dd></div>
        </dl>
      </div>
      <Link href={`/agent/${a.id}`} className="mt-3 inline-block microlabel !text-ink hover:underline">Open profile →</Link>
    </div>
  );
}
