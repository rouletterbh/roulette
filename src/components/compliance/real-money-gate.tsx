"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AgeGate } from "./age-gate";
import { useResponsibleGate } from "@/store/responsible";
import { useSessionReminder } from "@/components/responsible/use-session-reminder";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

/**
 * Wraps anything that can move money: 18+ / terms confirmation, then the
 * responsible-play gate (cooldown, self-exclusion, lock, time limit), with the
 * session reminder rendered on top. Practice mode never goes through this.
 */
export function RealMoneyGate({ children }: { children: React.ReactNode }) {
  return (
    <AgeGate>
      <ResponsibleGate>{children}</ResponsibleGate>
    </AgeGate>
  );
}

function ResponsibleGate({ children }: { children: React.ReactNode }) {
  const gate = useResponsibleGate();
  if (gate.blocked) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Eyebrow className="mb-4 block">Paused</Eyebrow>
        <h1 className="font-display text-display-md">{gate.reason}</h1>
        <p className="mt-4 max-w-md text-muted">
          {gate.until ? `Real-money play resumes ${new Date(gate.until).toLocaleString()}.` : "Real-money play is paused for the rest of today."} Practice tables stay open.
        </p>
        <div className="mt-8 flex gap-3"><Button href="/play/practice">Practice</Button><Button href="/responsible-play" variant="outline">Responsible play settings</Button></div>
      </div>
    );
  }
  return (
    <>
      <SessionReminderNotice />
      {children}
    </>
  );
}

function SessionReminderNotice() {
  const { due, dismiss, elapsedMs, minutes } = useSessionReminder();
  return (
    <AnimatePresence>
      {due && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} role="status" className="container-edge">
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-[13.5px] dark:bg-elevated">
            <span>You&apos;ve been playing for about {Math.round(elapsedMs / 60_000)} minutes{minutes ? ` (reminder set to ${minutes})` : ""}. Take a breath if you need one.</span>
            <div className="flex gap-2">
              <Link href="/responsible-play" className="h-8 rounded-full border border-border px-3 text-[12px] leading-8 hover:border-ink">Set a limit</Link>
              <button type="button" onClick={dismiss} className="h-8 rounded-full bg-ink px-3 text-[12px] text-canvas">Keep playing</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
