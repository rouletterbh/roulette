"use client";

import { useEffect } from "react";
import { useAgentNetwork } from "@/store/agent-network";
import { siteConfig } from "@/config/site";

/**
 * Starts the demo agent network once and ticks it while the app is open.
 * Demo mode off: the network never starts, so every consumer sees an empty
 * store (no agents, tables, events) and falls back to the viewer's own seats.
 */
export function AgentNetworkProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!siteConfig.demoMode) return;
    const s = useAgentNetwork.getState();
    s.start();
    const id = setInterval(() => useAgentNetwork.getState().tick(), 400);
    return () => clearInterval(id);
  }, []);
  return <>{children}</>;
}
