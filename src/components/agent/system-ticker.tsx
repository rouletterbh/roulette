"use client";

import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";

/** Thin horizontal telemetry ticker between sections. Slow, no news gimmick. */
export function SystemTicker({ className }: { className?: string }) {
  const mounted = useMounted();
  const events = useAgentNetwork((s) => s.events);
  const items = (mounted ? events.slice(-18) : []).map((e) => `${e.code} · ${short(e.text)}`);
  const list = items.length ? [...items, ...items] : ["AGENT NETWORK · TELEMETRY", "AGENT NETWORK · TELEMETRY"];
  return (
    <div className={cn("overflow-hidden border-y border-hairline", className)} aria-label="System ticker" role="marquee">
      <div className="flex w-max gap-10 py-2 [animation:ticker_90s_linear_infinite] hover:[animation-play-state:paused]">
        {list.map((t, i) => (
          <span key={i} className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            <span className="mr-3 inline-block h-1 w-1 rounded-full bg-accent align-middle" aria-hidden />{t}
          </span>
        ))}
      </div>
    </div>
  );
}

function short(s: string) {
  return s.replace(/\.$/, "").replace(/^Observed [^.]*\. /, "").slice(0, 48);
}
