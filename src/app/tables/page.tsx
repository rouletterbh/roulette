import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/roulette/table-card";
import { demoTables } from "@/lib/demo/data";
import { DemoBadge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { ChainTables } from "@/components/tables/chain-tables";

export const metadata: Metadata = { title: "Tables" };

export default function TablesPage() {
  return siteConfig.demoMode ? <DemoTablesPage /> : <ChainTablesPage />;
}

/** Demo-off: only tables that exist on RouletteGame, with live round state. */
function ChainTablesPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Eyebrow className="mb-4 block" live>Public tables</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">Pull up a seat.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every public table shares one wheel and one verified result per round. Limits are set by the treasury. We never fake liquidity.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button href="/create" variant="primary">Create a table</Button>
        </div>
      </div>
      <ChainTables />
    </div>
  );
}

/** Demo mode: simulated tables (unchanged). */
function DemoTablesPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Eyebrow className="mb-4 block" live>Public tables</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">Pull up a seat.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every public table shares one wheel and one verified result per round. Limits are set by the treasury.</p>
        </div>
        <div className="flex items-center gap-3">
          <DemoBadge />
          <Button href="/create" variant="primary">Create a table</Button>
        </div>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {demoTables.map((t) => (
          <TableCard key={t.id} table={t} />
        ))}
      </div>
      <p className="mt-8 text-[12.5px] text-muted">Locked tables open automatically when liquidity supports their maximum. We never fake liquidity.</p>
    </div>
  );
}
