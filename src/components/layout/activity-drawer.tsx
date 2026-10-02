"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDock } from "@/store/dock";
import { AgentActivityFeed } from "@/components/agent/agent-activity-feed";
import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { siteConfig } from "@/config/site";
import { useOwnSeats } from "@/components/agent/use-own-seats";

/** Global ACTIVITY drawer from the nav: network telemetry anywhere in the product. */
export function ActivityDrawer() {
  const open = useDock((s) => s.activityOpen);
  const setOpen = useDock((s) => s.setActivityOpen);
  const mounted = useMounted();
  const network = useAgentNetwork((s) => s.summary());
  const own = useOwnSeats();
  const summary = siteConfig.demoMode ? network : own.summary;
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.aside key="activity" role="dialog" aria-label="Network activity" initial={reduce ? false : { x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduce ? undefined : { x: 24, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="fixed inset-x-3 top-[84px] z-40 flex max-h-[70vh] flex-col border border-ink bg-canvas p-5 shadow-lg md:inset-x-auto md:right-5 md:w-[380px]">
          <div className="mb-3 flex items-center justify-between">
            <div><div className="font-display text-2xl leading-none">Activity</div><div className="microlabel mt-1">{mounted ? `${summary.active} active · ${summary.executing} executing` : "—"}</div></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="microlabel !text-ink">Close</button>
          </div>
          <AgentActivityFeed limit={30} className="min-h-0 flex-1" title={null} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
