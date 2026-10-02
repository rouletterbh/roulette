"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Official Robinhood Chain logo slot. Renders the supplied file from
 * /public/brand when present; otherwise a plain wordmark. Never generated.
 */
export function RobinhoodChainLogo({ height = 16, className, withText = true }: { height?: number; className?: string; withText?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (missing) return withText ? <span className={cn("whitespace-nowrap font-medium", className)}>Robinhood Chain</span> : null;
  return (
    <span className={cn("inline-flex items-center", className)}>
      <picture>
        <source srcSet="/brand/robinhood-chain-dark.svg" media="(prefers-color-scheme: dark)" />
        <img src="/brand/robinhood-chain.svg" alt="Robinhood Chain" style={{ height, width: "auto" }} onError={() => setMissing(true)} className="dark:hidden" />
      </picture>
      <img src="/brand/robinhood-chain-dark.svg" alt="Robinhood Chain" style={{ height, width: "auto" }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/brand/robinhood-chain.svg"; }} className="hidden dark:block" />
    </span>
  );
}

/** Token logo slot: official file via logoURI, else a monogram. */
export function TokenLogo({ symbol, logoURI, size = 28, className, tone = "ink" }: { symbol: string; logoURI?: string | null; size?: number; className?: string; tone?: "ink" | "accent" }) {
  const [missing, setMissing] = useState(false);
  if (logoURI && !missing) {
    return <img src={logoURI} alt={`${symbol} logo`} width={size} height={size} className={cn("shrink-0 rounded-full object-contain", className)} onError={() => setMissing(true)} />;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", tone === "ink" ? "bg-ink text-canvas" : "bg-accent text-accent-ink", className)} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }} aria-hidden>
      {symbol.slice(0, 3)}
    </span>
  );
}
