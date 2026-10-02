import { Fragment } from "react";
import { cn } from "@/lib/utils";

const NODES: Array<[string, string, boolean?]> = [
  ["Agent", "reads · verifies · quotes · builds intents"],
  ["API", "/api/v1 · MCP · returns unsigned intents"],
  ["Wallet", "signs · the only key holder", true],
  ["Contract", "RiskEngine.checkWager · reverts over cap"],
  ["Table", "round · commit–reveal result"],
];

function Arrow() {
  return (
    <svg viewBox="0 0 40 16" className="h-6 w-6 shrink-0 self-center rotate-90 text-muted sm:h-4 sm:w-10 sm:rotate-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="1">
      <line x1="0" y1="8" x2="34" y2="8" />
      <path d="M30 4 L35 8 L30 12" strokeLinecap="square" />
    </svg>
  );
}

/**
 * Execution path: AGENT → API → WALLET → CONTRACT → TABLE. Hairline boxes,
 * currentColor arrows, corner metadata. Vertical on phones, horizontal from sm.
 */
export function ArchitectureStrip({ className }: { className?: string }) {
  return (
    <figure className={cn("blueprint border border-hairline", className)} aria-label="Agent execution path">
      <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline px-4 py-2">
        <span className="microlabel">Fig. 01 · Execution path</span>
        <span className="microlabel !text-ink">API never signs. The agent wallet signs.</span>
      </div>
      <div className="relative z-10 flex flex-col gap-1 p-4 sm:flex-row sm:items-stretch sm:gap-0 md:p-6">
        {NODES.map(([name, sub, emph], i) => (
          <Fragment key={name}>
            <div className={cn("flex min-w-0 flex-1 flex-col justify-between border bg-canvas px-4 py-3", emph ? "border-ink" : "border-border")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink">{name}</span>
                <span className="font-mono text-[10px] tnum text-faint">0{i + 1}</span>
              </div>
              <div className={cn("mt-2 font-mono text-[10px] leading-relaxed", emph ? "text-ink" : "text-muted")}>{sub}</div>
            </div>
            {i < NODES.length - 1 && <Arrow />}
          </Fragment>
        ))}
      </div>
      <figcaption className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline px-4 py-2">
        <span className="microlabel">Intents carry to · chainId · data · abi · description</span>
        <span className="microlabel">Demo · Testnet</span>
      </figcaption>
    </figure>
  );
}
