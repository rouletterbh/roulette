"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { TableCard } from "@/components/roulette/table-card";
import { demoTables, type DemoTable, type TableSpeed } from "@/lib/demo/data";
import { useCreatedTables } from "@/store/created-tables";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ExploreView() {
  const created = useCreatedTables((s) => s.tables);
  const [minBet, setMinBet] = useState(0);
  const [maxBet, setMaxBet] = useState(1000);
  const [players, setPlayers] = useState(0);
  const [speed, setSpeed] = useState<TableSpeed | "any">("any");

  const all: DemoTable[] = useMemo(
    () => [
      ...demoTables,
      ...created.map<DemoTable>((t) => ({ id: t.id, name: t.name, variant: "European Roulette", players: 1, spectators: 0, minBet: t.minBet, maxBet: t.maxBet, speed: t.speed, status: "live", visibility: t.visibility, recent: [] })),
    ],
    [created],
  );
  const filtered = all.filter((t) => t.minBet >= minBet && t.maxBet <= maxBet && t.players >= players && (speed === "any" || t.speed === speed));

  const groups: Array<{ title: string; items: DemoTable[]; empty: string }> = [
    { title: "Live tables", items: filtered.filter((t) => t.status === "live" && t.visibility === "public"), empty: "No live tables match these filters." },
    { title: "High activity", items: filtered.filter((t) => t.players >= 7), empty: "Quiet right now." },
    { title: "New tables", items: filtered.filter((t) => created.some((c) => c.id === t.id)), empty: "No new tables yet. Create one." },
    { title: "Private games", items: filtered.filter((t) => t.visibility === "private"), empty: "Private tables appear here when you hold an invite." },
  ];

  const field = (label: string, control: React.ReactNode) => (
    <label className="flex items-center gap-2 text-[12.5px] text-muted">
      {label}
      {control}
    </label>
  );
  const input = "h-8 w-20 rounded-full border border-border bg-transparent px-3 text-[12.5px] text-ink tnum outline-none focus:border-ink";

  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Explore</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Find your table.</h1>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-hairline py-4">
        {field("Min bet ≥", <input type="number" min={0} value={minBet} onChange={(e) => setMinBet(Number(e.target.value))} className={input} aria-label="Minimum bet" />)}
        {field("Max bet ≤", <input type="number" min={0} value={maxBet} onChange={(e) => setMaxBet(Number(e.target.value))} className={input} aria-label="Maximum bet" />)}
        {field("Players ≥", <input type="number" min={0} value={players} onChange={(e) => setPlayers(Number(e.target.value))} className={input} aria-label="Minimum players" />)}
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Game speed">
          {(["any", "relaxed", "standard", "fast"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} className={cn("h-8 rounded-full px-3 text-[12px] capitalize transition-colors", speed === s ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {groups.map((gp) => (
        <section key={gp.title} className="mt-14">
          <h2 className="font-display mb-6 text-3xl">{gp.title}</h2>
          {gp.items.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{gp.items.map((t) => <TableCard key={t.id} table={t} />)}</div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[13.5px] text-muted">{gp.empty}</p>
          )}
        </section>
      ))}

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
