"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useChainTables, useLatestRounds, useTreasurySnapshot } from "@/lib/web3/hooks";
import { resolveChainTableId } from "@/lib/web3/contracts";
import { buildTableRows, buildTreasuryView, formatEth, roundStatusLabel, type Money } from "@/lib/web3/treasury-view";
import { useOwnSeats } from "@/components/agent/use-own-seats";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn, formatUsd } from "@/lib/utils";

/**
 * Homepage figures when demo mode is off. Every number is read from Robinhood
 * Chain (RouletteGame / CasinoTreasury) or from the viewer's own agent seats;
 * network-wide player or agent counts do not exist on chain and are never shown.
 * Server and first client render show "—" until the reads land.
 */
export function useHomeChain() {
  const mounted = useMounted();
  const tables = useChainTables();
  const rounds = useLatestRounds();
  const treasury = useTreasurySnapshot();
  const defaultTableId = resolveChainTableId();
  const rows = useMemo(() => buildTableRows(tables.tables, rounds.rounds, { maxStraightUnits: tables.maxStraightUnits, roundTimeout: tables.roundTimeout, defaultTableId }), [tables.tables, rounds.rounds, tables.maxStraightUnits, tables.roundTimeout, defaultTableId]);
  const view = useMemo(() => buildTreasuryView(treasury.raw), [treasury.raw]);
  const live = useMemo(() => rounds.rounds.find((r) => r.tableId === defaultTableId) ?? null, [rounds.rounds, defaultTableId]);
  return {
    mounted,
    tablesReady: mounted && tables.isFetched,
    tablesOnline: rows.filter((r) => r.active).length,
    rows,
    roundsReady: mounted && rounds.scanned && !rounds.isLoading,
    live,
    treasuryReady: mounted && treasury.isFetched,
    view,
    /** Chain collateralization as a label, or solvency when there are no liabilities yet. */
    health: !mounted || !treasury.isFetched ? "—" : view.collateralizationPct != null ? `${Math.min(999, view.collateralizationPct).toFixed(0)}%` : view.isSolvent ? "Solvent" : "—",
    healthOk: view.collateralizationPct != null ? view.collateralizationPct >= 100 : view.isSolvent,
  };
}

/** Hero stat trio: own seated agents · on-chain tables · live round of the default table. */
export function ChainHeroStats() {
  const c = useHomeChain();
  const { summary } = useOwnSeats();
  const items: Array<[string, string]> = [
    [c.mounted ? String(summary.seated) : "—", summary.seated === 1 ? "agent seated" : "agents seated"],
    [c.tablesReady ? String(c.tablesOnline) : "—", c.tablesOnline === 1 ? "table online" : "tables online"],
    [c.roundsReady ? (c.live ? `#${c.live.roundId.toString()}` : "—") : "—", "live round"],
  ];
  return (
    <>
      {items.map(([v, k]) => (
        <div key={k} className="flex items-center gap-1.5 whitespace-nowrap">
          <dd className="tnum font-medium text-ink">{v}</dd>
          <dt>{k}</dt>
        </div>
      ))}
    </>
  );
}

/** Thin operating strip: the viewer's seats by state, the live round, treasury health from chain. */
export function ChainCommandStrip({ className }: { className?: string }) {
  const c = useHomeChain();
  const { summary } = useOwnSeats();
  const m = c.mounted;
  const items: Array<[string, string, boolean?]> = [
    ["Active", m ? String(summary.active) : "—", true],
    ["Observing", m ? String(summary.observing) : "—"],
    ["Executing", m ? String(summary.executing) : "—"],
    ["Paused", m ? String(summary.paused) : "—"],
    ["Settling", m ? String(summary.settling) : "—"],
    ["Round", c.roundsReady && c.live ? `#${c.live.roundId.toString()} · ${roundStatusLabel(c.live.status)}` : "—"],
    ["Treasury health", c.health, c.treasuryReady && c.healthOk],
  ];
  return (
    <div className={cn("container-edge", className)}>
      <Link href="/agents" className="flex flex-wrap items-center gap-x-7 gap-y-2 border-y border-hairline py-3 transition-colors hover:bg-sunken/40">
        <span className="microlabel !text-ink">Your agents</span>
        {items.map(([k, v, dot]) => (
          <span key={k} className="flex items-baseline gap-2">
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
            <span className="font-mono text-[13px] tnum text-ink">{v}</span>
            <span className="microlabel">{k}</span>
          </span>
        ))}
      </Link>
    </div>
  );
}

/** Solvency strip: the same peg-derived USD + units figures as the treasury page. */
export function ChainSolvencyStrip() {
  const c = useHomeChain();
  const v = c.view;
  const money = (mo: Money) => (!c.treasuryReady ? "—" : v.hasPeg ? formatUsd(mo.usd) : formatEth(mo.wei));
  const units = (mo: Money) => (c.treasuryReady && v.hasPeg ? `${mo.units.toLocaleString("en-US")} units · ${formatEth(mo.wei)}` : "");
  const items = [
    { label: "Bankroll", value: money(v.bankroll), note: units(v.bankroll) },
    { label: "Available for payouts", value: money(v.available), note: units(v.available) },
    { label: "Reserved", value: money(v.reserved), note: units(v.reserved) },
    { label: "Table max · straight bet", value: !c.treasuryReady ? "—" : v.hasPeg ? formatUsd(v.maxStraightUsd) : "—", note: c.treasuryReady ? `${v.maxStraightUnits.toLocaleString("en-US")} units` : "", accent: true },
  ];
  return (
    <div className="container-edge">
      <Link href="/treasury" className="group grid grid-cols-2 gap-x-6 gap-y-5 border-y border-hairline py-6 transition-colors md:grid-cols-[repeat(4,1fr)_auto] md:items-center">
        {items.map((i) => (
          <div key={i.label}>
            <div className="eyebrow mb-1.5 text-[10px]">{i.label}</div>
            <div className="font-display text-2xl tnum text-ink md:text-3xl">
              {i.value}
              {i.accent && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-hidden />}
            </div>
            {i.note && <div className="mt-1 font-mono text-[10px] tnum text-faint">{i.note}</div>}
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between gap-3 text-[12.5px] text-muted md:col-span-1 md:flex-col md:items-end">
          <span className="microlabel">{c.treasuryReady && v.hasPeg ? `USD at the chip peg · 1 unit = ${formatUsd(v.chipUsd)}` : "Read from CasinoTreasury"}</span>
          <span className="transition-colors group-hover:text-ink">Limits scale with treasury →</span>
        </div>
      </Link>
    </div>
  );
}

/** "The network never sleeps": the viewer's own agents and the on-chain tables, nothing invented. */
export function ChainNetworkStrip() {
  const c = useHomeChain();
  const { summary } = useOwnSeats();
  const m = c.mounted;
  const stats: Array<[string, string]> = [
    ["Your agents active", m ? String(summary.active) : "—"],
    ["Tables onchain", c.tablesReady ? String(c.tablesOnline) : "—"],
    ["Decisions logged", m ? summary.decisions.toLocaleString("en-US") : "—"],
    ["Skips", m ? summary.skips.toLocaleString("en-US") : "—"],
    ["Collections settled", m ? String(summary.collections) : "—"],
  ];
  return (
    <section className="container-edge py-20 md:py-28">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow className="mb-4 block">Network</Eyebrow>
          <h2 className="font-display text-display-md">The network never sleeps.</h2>
        </div>
        <span className="microlabel">Your seats · live chain state</span>
      </div>
      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink py-8 md:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="microlabel">{k}</dt>
            <dd className="font-display mt-1 text-4xl tnum">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-10 grid gap-px md:grid-cols-3">
        {!c.tablesReady ? (
          <p className="py-5 text-[13px] text-muted">Reading Robinhood Chain…</p>
        ) : c.rows.length === 0 ? (
          <p className="py-5 text-[13px] text-muted">No public tables on chain yet.</p>
        ) : (
          c.rows.map((t, i) => (
            <div key={t.id} className={cn("py-5 md:px-6 md:first:pl-0 md:last:pr-0", i > 0 && "border-t border-hairline md:border-l md:border-t-0")}>
              <div className="flex items-baseline justify-between">
                <Link href={t.href} className="font-display text-2xl hover:underline">{t.name}</Link>
                <span className="microlabel tnum">{t.minStake.toLocaleString("en-US")}–{t.maxStake.toLocaleString("en-US")} units</span>
              </div>
              <div className="mt-3 font-mono text-[12px] tnum text-ink-2">
                {!c.roundsReady ? "Reading…" : t.round ? `Round #${t.round.roundId.toString()} · ${t.round.status} · ${t.round.betCount} bets` : "No round open"}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
