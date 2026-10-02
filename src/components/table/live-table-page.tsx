"use client";

import { useMounted } from "@/lib/hooks/use-mounted";
import { demoTables } from "@/lib/demo/data";
import { useCreatedTables } from "@/store/created-tables";
import { GameTable, type GameTableConfig } from "@/components/roulette/game-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { tableName } from "@/lib/web3/treasury-view";

export function LiveTablePage({ id }: { id: string }) {
  const created = useCreatedTables((s) => s.tables);
  const hydrated = useMounted();

  const demo = demoTables.find((t) => t.id === id);
  const own = created.find((t) => t.id === id || t.inviteCode === id);
  // Demo off: /table/<n> is chain table n (ChainGameDriver resolves it via resolveChainTableId).
  const chain = !siteConfig.demoMode && /^\d+$/.test(id) && Number(id) > 0;

  if (!hydrated) return <div className="container-edge py-24" aria-busy="true" />;

  if (chain) return <GameTable key={id} config={{ mode: "live", tableId: id, name: tableName(Number(id)), minBet: 1 }} />;

  if (demo?.status === "locked") {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Badge tone="outline" className="mb-5">Locked</Badge>
        <h1 className="font-display text-display-md">{demo.name} isn&apos;t open yet.</h1>
        <p className="mt-4 max-w-md text-muted">{demo.lockedReason} Limits expand automatically as the treasury grows. Nothing here is faked.</p>
        <div className="mt-8 flex gap-3"><Button href="/treasury" variant="outline">See the treasury</Button><Button href="/tables">Other tables</Button></div>
      </div>
    );
  }

  const config: GameTableConfig | null = demo
    ? { mode: "live", tableId: demo.id, name: demo.name, speed: demo.speed, seats: Math.min(demo.players, 6), minBet: demo.minBet, maxBet: demo.maxBet, visibility: demo.visibility, inviteCode: demo.id, recent: demo.recent }
    : own
      ? { mode: "private", tableId: own.id, name: own.name, speed: own.speed, seats: Math.max(1, Math.min(own.seats - 1, 5)), minBet: own.minBet, maxBet: own.maxBet, visibility: own.visibility, inviteCode: own.inviteCode }
      : null;

  if (!config) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <picture><source srcSet="/art/generated/empty-table-light.webp" type="image/webp" /><img src="/art/generated/empty-table-light.png" alt="A single chip on an empty surface" className="mb-6 h-40 w-40 rounded-2xl object-cover" /></picture>
        <h1 className="font-display text-display-md">No table here.</h1>
        <p className="mt-4 max-w-md text-muted">This table may have closed, or the invite code is wrong.</p>
        <div className="mt-8 flex gap-3"><Button href="/tables">Browse tables</Button><Button href="/create" variant="outline">Create one</Button></div>
      </div>
    );
  }
  return <GameTable key={config.tableId} config={config} />;
}
