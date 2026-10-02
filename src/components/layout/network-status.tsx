"use client";

import { activeChain } from "@/config/chains";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { RobinhoodChainLogo } from "./brand-logo";

export function NetworkStatus({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn("inline-flex items-center gap-2 text-[12px] font-medium text-muted", className)}
      title={`Connected to ${activeChain.name} (chain id ${activeChain.id})`}
    >
      <span className="live-dot" aria-hidden />
      {!compact && <span className="hidden lg:inline"><RobinhoodChainLogo height={14} /></span>}
      {siteConfig.chainEnv === "testnet" && (
        <span className="rounded-full border border-border px-1.5 py-px text-[10px] uppercase tracking-[0.12em]">Testnet</span>
      )}
    </div>
  );
}
