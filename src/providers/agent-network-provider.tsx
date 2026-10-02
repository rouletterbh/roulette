"use client";

import { useEffect } from "react";
import { useAgentNetwork } from "@/store/agent-network";

/** Starts the demo agent network once and ticks it while the app is open. */
export function AgentNetworkProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const s = useAgentNetwork.getState();
    s.start();
    const id = setInterval(() => useAgentNetwork.getState().tick(), 400);
    return () => clearInterval(id);
  }, []);
  return <>{children}</>;
}
