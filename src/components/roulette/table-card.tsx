"use client";

import { useEffect, useState } from "react";
import type { DemoTable } from "@/lib/demo/data";
import { useAgentNetwork } from "@/store/agent-network";
import { useMounted } from "@/lib/hooks/use-mounted";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { NumberPill } from "@/components/ui/number-pill";
import { Button } from "@/components/ui/button";
import type { AgentState } from "@/lib/agent/states";
import { cn } from "@/lib/utils";

/** States that count as "seated and operating" for the glyph row. */
const LIVE_STATES = new Set<AgentState>(["observing", "waiting", "thinking", "leash-check", "prepared", "executing", "locked", "settling", "collected"]);

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const clock = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

function Item({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="microlabel">{k}</dt>
      <dd className={cn("font-mono text-[12px] tnum", strong ? "text-ink" : "text-ink-2")}>{v}</dd>
    </div>
  );
}

const label = "font-mono text-[11px] uppercase tracking-[0.12em]";

/**
 * TableCard: a table as an operating instrument, not a brochure. Reads demo
 * network telemetry (round, exposure, countdown, seated agents) when present and
 * falls back to the static demo table otherwise. Parent controls width.
 */
export function TableCard({ table, className }: { table: DemoTable; className?: string }) {
  const locked = table.status === "locked";
  const mounted = useMounted();
  const round = useAgentNetwork((s) => s.tables[table.id]);
  const allAgents = useAgentNetwork((s) => s.agents);
  const now = useNow(Boolean(round) && !locked);

  const seated = allAgents.filter((a) => a.tableId === table.id && LIVE_STATES.has(a.state));
  const humans = Math.max(0, table.players - seated.length);
  const recent = round?.recent ?? table.recent;
  const secs = round ? Math.max(0, Math.ceil((round.nextAt - now) / 1000)) : null;
  const nextKey = round?.phase === "locked" ? "Reveal" : round?.phase === "settling" ? "Next" : "Closes";

  return (
    <article
      aria-label={`${table.name} table`}
      className={cn(
        "relative flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors duration-300 hover:border-border-strong dark:bg-elevated",
        locked && "bg-transparent hover:border-border dark:bg-transparent",
        className,
      )}
    >
      {/* Corner metadata */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {!locked && <span className="live-dot scale-[0.8]" aria-hidden />}
          <span className={cn("microlabel", !locked && "!text-ink")}>{locked ? "European · Locked" : "European"}</span>
        </div>
        <span className="microlabel tnum">
          {table.speed} · {table.minBet}–{table.maxBet}
        </span>
      </div>

      <h3 className="font-display mt-3 text-[2rem] leading-none md:text-[2.25rem]">{table.name}</h3>

      {/* Telemetry row */}
      <dl className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 hairline-t hairline-b py-2.5" aria-label="Round telemetry">
        {locked ? (
          <Item k="Status" v="Awaiting liquidity" />
        ) : round && mounted ? (
          <>
            <Item k="Round" v={`#${round.roundId}`} strong />
            <Item k="Exposure" v={`${round.exposurePct.toFixed(1)}%`} />
            <Item k={nextKey} v={clock(secs ?? 0)} strong={round.phase !== "open"} />
          </>
        ) : (
          <>
            <Item k="Round" v="—" />
            <Item k="Exposure" v="—" />
            <Item k="Closes" v="--:--" />
          </>
        )}
      </dl>

      {/* Seats */}
      {!locked && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-h-[22px] items-center gap-1.5 text-ink" aria-hidden={seated.length === 0}>
            {seated.slice(0, 4).map((a) => (
              <AgentGlyph key={a.id} seed={a.id} state={a.state} size={22} title={`${a.code} · ${a.state}`} />
            ))}
            {mounted && seated.length === 0 && <span className="microlabel">No agents seated</span>}
          </div>
          <span className="microlabel tnum">
            {seated.length} agents · {humans} humans
          </span>
        </div>
      )}

      {/* Recent / locked reason */}
      <div className="mt-4 flex-1">
        {locked ? (
          <p className="text-[12.5px] leading-snug text-muted">{table.lockedReason}</p>
        ) : recent.length === 0 ? (
          <span className="text-[12px] text-muted">No results yet</span>
        ) : (
          <ol className="flex items-center gap-1" aria-label="Recent results, newest first">
            {recent.slice(0, 6).map((n, i) => (
              <li key={`${n}-${i}`} className={cn(i === 0 && "mr-0.5")}>
                <NumberPill n={n} size="sm" highlight={i === 0} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        {locked ? (
          <Button href="/treasury" variant="outline" size="sm" className="flex-1">
            <span className={label}>Treasury →</span>
          </Button>
        ) : (
          <>
            <Button href={`/table/${table.id}?spectate=1`} variant="outline" size="sm" className="flex-1">
              <span className={label}>Watch</span>
            </Button>
            <Button href={`/table/${table.id}`} variant="primary" size="sm" className="flex-1">
              <span className={label}>Take a seat</span>
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
