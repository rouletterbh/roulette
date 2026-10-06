"use client";

import { useCallback, useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { explorerAddress, robinhoodChain } from "@/config/chains";
import { cn } from "@/lib/utils";

/** The RBL contract address with copy and explorer actions. Plain facts only: no price, no promise. */
export function TokenAddress({ className, compact }: { className?: string; compact?: boolean }) {
  const { token } = siteConfig;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
    } catch {
      /* clipboard unavailable: the address is still selectable */
    }
  }, [token.address]);
  const short = `${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted", className)}>
      <span className="font-medium text-ink">
        {token.symbol}
        {compact ? "" : ` · ${token.name} token`}
      </span>
      <code className="tnum select-all font-mono text-[11.5px] text-ink-2" title={token.address} aria-label={`${token.symbol} contract address ${token.address}`}>
        {compact ? short : token.address}
      </code>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
        aria-live="polite"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={explorerAddress(token.address, robinhoodChain)}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-2 hover:underline"
      >
        Explorer ↗
      </a>
    </div>
  );
}
