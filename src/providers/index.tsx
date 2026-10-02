"use client";

import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";
import { Web3Provider } from "./web3-provider";
import { AgentNetworkProvider } from "./agent-network-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <Web3Provider>
          <AgentNetworkProvider>{children}</AgentNetworkProvider>
        </Web3Provider>
      </QueryProvider>
    </ThemeProvider>
  );
}
