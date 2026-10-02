"use client";

import { useEffect, useMemo, useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useChainTables, useLatestRounds } from "@/lib/web3/hooks";
import { contractAddresses, resolveChainTableId } from "@/lib/web3/contracts";
import { buildTableRows, formatClock, type TableRowView } from "@/lib/web3/treasury-view";
import { explorerAddress } from "@/config/chains";
import Link from "next/link";
import { NumberPill } from "@/components/ui/number-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tables page body when demo mode is off: one card per on-chain table
 * (RouletteGame.tableCount / tables), its latest round from the RoundOpened scan +
 * getRound, and the straight-up maximum the treasury backs right now
 * (maxStakeFor(35)). No seat counts, no simulated results, no invented tables.
 */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Item({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="microlabel">{k}</dt>
      <dd className={cn("font-mono text-[12px] tnum", strong ? "text-ink" : "text-ink-2")}>{v}</dd>
    </div>
  );
}

const label = "font-mono text-[11px] uppercase tracking-[0.12em]";

export function ChainTableCard({ table, now, scanned, className }: { table: TableRowView; now: number; scanned: boolean; className?: string }) {
  const r = table.round;
  const live = table.active;
  const nowS = Math.floor(now / 1000);
  const opened = r && r.openedAt > 0 ? formatClock(Math.max(0, nowS - r.openedAt)) : null;
  const timeout = r?.timesOutAt != null ? formatClock(r.timesOutAt - nowS) : null;

  return (
    <article
      aria-label={`${table.name} table`}
      className={cn(
        "relative flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors duration-300 hover:border-border-strong dark:bg-elevated",
        !live && "bg-transparent hover:border-border dark:bg-transparent",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {live && <span className="live-dot scale-[0.8]" aria-hidden />}
          <span className={cn("microlabel", live && "!text-ink")}>{live ? "European · Onchain" : "European · Inactive"}</span>
        </div>
        <span className="microlabel tnum">
          {table.minStake.toLocaleString("en-US")}–{table.maxStake.toLocaleString("en-US")} units
        </span>
      </div>

      <h3 className="font-display mt-3 text-[2rem] leading-none md:text-[2.25rem]">{table.name}</h3>

      <dl className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 hairline-t hairline-b py-2.5" aria-label="Round telemetry">
        {!scanned ? (
          <>
            <Item k="Round" v="—" />
            <Item k="Phase" v="—" />
            <Item k="Opened" v="--:--" />
          </>
        ) : r ? (
          <>
            <Item k="Round" v={`#${r.roundId.toString()}`} strong />
            <Item k="Phase" v={r.status} strong={r.status !== "Open"} />
            {r.status === "Open" && timeout ? <Item k="Times out" v={timeout} /> : opened ? <Item k="Opened" v={`${opened} ago`} /> : null}
            <Item k="Bets" v={`${r.betCount} · ${r.totalStakedUnits.toLocaleString("en-US")} u`} />
          </>
        ) : (
          <>
            <Item k="Round" v="none" />
            <Item k="Phase" v="waiting for operator" />
          </>
        )}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="microlabel">Straight-up max · treasury-backed</span>
        <span className="microlabel tnum !text-ink">{scanned ? `${table.effectiveMaxStraight.toLocaleString("en-US")} units` : "—"}</span>
      </div>

      <div className="mt-4 flex-1">
        {r?.result != null ? (
          <ol className="flex items-center gap-1" aria-label="Last settled result">
            <li>
              <NumberPill n={r.result} size="sm" highlight />
            </li>
            <li className="ml-1 text-[12px] text-muted">last settled</li>
          </ol>
        ) : (
          <span className="text-[12px] text-muted">{!live ? "Closed by the operator." : table.treasuryLimited && scanned ? `Limits grow with the treasury: the ${table.maxStake.toLocaleString("en-US")}-unit maximum is not fully backed yet.` : "No results yet"}</span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {live ? (
          <Button href={table.href} variant="primary" size="sm" className="flex-1">
            <span className={label}>Take a seat</span>
          </Button>
        ) : (
          <Button href="/treasury" variant="outline" size="sm" className="flex-1">
            <span className={label}>Treasury →</span>
          </Button>
        )}
      </div>
    </article>
  );
}

export function ChainTables({ gridClassName = "mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3", note = true }: { gridClassName?: string; note?: boolean }) {
  const mounted = useMounted();
  const t = useChainTables();
  const rounds = useLatestRounds();
  const scanned = mounted && t.isFetched && rounds.scanned;
  const now = useNow(scanned);
  const defaultTableId = resolveChainTableId();
  const rows = useMemo(() => buildTableRows(t.tables, rounds.rounds, { maxStraightUnits: t.maxStraightUnits, roundTimeout: t.roundTimeout, defaultTableId }), [t.tables, rounds.rounds, t.maxStraightUnits, t.roundTimeout, defaultTableId]);

  if (!contractAddresses.game) {
    return <p className="mt-12 text-[13px] text-muted">Game contract address not configured (NEXT_PUBLIC_ROULETTE_GAME_ADDRESS). No tables to read.</p>;
  }

  return (
    <>
      <div className={gridClassName}>
        {!mounted || !t.isFetched ? (
          <p className="text-[13px] text-muted">Reading Robinhood Chain…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted">No public tables on chain yet.{t.error ? ` (${t.error.message})` : ""}</p>
        ) : (
          rows.map((row) => <ChainTableCard key={row.id} table={row} now={now} scanned={scanned} />)
        )}
      </div>
      {note && (
        <p className="mt-8 text-[12.5px] text-muted">
          Limits come from RouletteGame.tables and the treasury&apos;s per-round cap (maxStakeFor). Round state is read live; nothing here is simulated.{" "}
          <a href={explorerAddress(contractAddresses.game)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            RouletteGame ↗
          </a>
        </p>
      )}
    </>
  );
}

/** /explore when demo mode is off: on-chain tables plus the practice table; no simulated activity filters. */
export function ChainExploreView() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Explore</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Find your table.</h1>
      </div>
      <section className="mt-14">
        <h2 className="font-display mb-6 text-3xl">Live tables</h2>
        <ChainTables gridClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3" />
      </section>
      <section className="mt-14">
        <h2 className="font-display mb-6 text-3xl">Practice games</h2>
        <Link href="/play/practice" className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-border-strong dark:bg-elevated md:max-w-md">
          <div className="flex items-start justify-between"><h3 className="font-display text-3xl">Practice table</h3><span className="eyebrow">Free</span></div>
          <p className="mt-6 text-[13.5px] text-muted">Practice chips with no monetary value. Same wheel, same fairness proof.</p>
          <Button variant="outline" size="sm" className="mt-6 w-fit">Open</Button>
        </Link>
      </section>
    </div>
  );
}
