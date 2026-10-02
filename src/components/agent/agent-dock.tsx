"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDock } from "@/store/dock";
import { useAgentSeats } from "@/store/agent-seat";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useMyAgent, seatLeash } from "./use-my-agent";
import { AgentGlyph } from "./agent-glyph";
import { AgentStatus } from "./agent-status";
import { AgentLeash } from "./agent-leash";
import { AgentLog } from "./agent-log";
import { describeRules } from "@/store/agent-seat";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Global agent dock: compact floating bar (desktop, bottom-right) or bottom
 * sheet (mobile) for the user's running agent. Expands to table, thesis, latest
 * action, remaining allowance, pause/stop. Hidden when no agent exists.
 */
export function AgentDock() {
  const mounted = useMounted();
  const { seat, state } = useMyAgent();
  const open = useDock((s) => s.open);
  const setOpen = useDock((s) => s.setOpen);
  const actions = useAgentSeats();
  const reduce = useReducedMotion();
  if (!mounted || !seat) return null;
  const leash = seatLeash(seat);
  const last = [...seat.log].reverse().find((l) => l.kind === "bet" || l.kind === "result" || l.kind === "skip" || l.kind === "stopped");
  const rules = describeRules(seat.rules);
  const tableHref = seat.tableId === "quick" ? "/play/quick" : seat.tableId === "practice" ? "/play/practice" : `/table/${seat.tableId}`;

  return (
    <>
      {/* compact bar */}
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${seat.code} agent dock`}
        initial={reduce ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn("fixed z-40 flex items-center gap-3 border border-ink bg-canvas px-3 py-2 text-left shadow-md", "bottom-[76px] left-3 right-3 lg:bottom-5 lg:left-auto lg:right-5 lg:w-[320px]")}
      >
        <AgentGlyph seed={seat.id} state={state} size={32} className="text-ink" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between"><span className="font-mono text-[12px] uppercase tracking-[0.06em]">{seat.code}</span><AgentStatus state={state} /></div>
          <div className="mt-0.5 flex gap-3 font-mono text-[11px] tnum text-muted"><span>Round {seat.roundsPlayed} / {seat.rules.maxRounds}</span><span>Stop loss {Math.round(leash.loss)} / {seat.rules.stopLoss}</span></div>
        </div>
        <span className="microlabel !text-ink">{open ? "Hide" : "View"}</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="dock"
            role="dialog"
            aria-label="Agent details"
            initial={reduce ? false : { y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: 16, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn("fixed z-40 border border-ink bg-canvas p-5 shadow-lg", "bottom-[136px] left-3 right-3 max-h-[60vh] overflow-y-auto lg:bottom-[86px] lg:left-auto lg:right-5 lg:w-[360px]")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-2xl leading-none">{seat.name}</div>
                <div className="microlabel mt-1">{seat.strategyClass} · <Link href={tableHref} className="underline-offset-2 hover:underline">{seat.tableId}</Link></div>
              </div>
              <AgentStatus state={state} long />
            </div>
            <div className="mt-4 border-t border-hairline pt-3">
              <div className="microlabel">Thesis</div>
              <p className="mt-1 text-[13px] text-ink-2">{seat.thesis || `IF ${rules.when} THEN ${rules.then} · ${rules.size}`}</p>
            </div>
            <div className="mt-4 border-t border-hairline pt-3">
              <div className="microlabel">Latest action</div>
              <p className="mt-1 font-mono text-[12px] text-ink-2">{last?.text ?? "No decisions yet."}</p>
            </div>
            <div className="mt-4 border-t border-hairline pt-3">
              <AgentLeash usage={leash} size={120} triggered={seat.status === "stopped" ? seat.stoppedReason : null} />
            </div>
            <div className="mt-2 microlabel">Remaining allowance · <span className="text-ink">{formatNumber(leash.chips)}</span> chips</div>
            <AgentLog items={seat.log} max={4} className="mt-4 border-t border-hairline pt-3" />
            <div className="mt-4 flex items-center gap-2">
              {seat.status === "active" && <Button size="sm" variant="outline" onClick={() => actions.pause(seat.id)}>Pause</Button>}
              {seat.status === "paused" && <Button size="sm" variant="outline" onClick={() => actions.resume(seat.id)}>Resume</Button>}
              {seat.status === "pending-approval" && <Button size="sm" variant="accent" href={tableHref}>Approve at table</Button>}
              {seat.status !== "pending-approval" && <Button size="sm" variant="ghost" onClick={() => actions.stop(seat.id, "Stopped by owner.")}>Stop</Button>}
              <Link href={`/agent/${seat.id}`} className="ml-auto microlabel !text-ink hover:underline">Profile</Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
