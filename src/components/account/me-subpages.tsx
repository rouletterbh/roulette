"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MeShell } from "./me-shell";
import { ChipsPanel } from "./chips-panel";
import { RewardsPanel, ClaimsList } from "./rewards-panel";
import { RoundHistory } from "@/components/player/round-history";
import { StatList } from "@/components/ui/stat";
import { DemoBadge } from "@/components/ui/badge";
import { rewardRegistry } from "@/config/tokens";
import { getAccountDemo, getHistory, getPlayer } from "@/lib/demo/players";
import { formatUsd, cn } from "@/lib/utils";

type Filter = "all" | "wins" | "losses";

export function MeHistory() {
  const [filter, setFilter] = useState<Filter>("all");
  return (
    <MeShell title="Every round, with its proof." lede="Newest first. Each row links to the commit–reveal record for that round.">
      {({ address }) => <HistoryBody address={address} filter={filter} setFilter={setFilter} />}
    </MeShell>
  );
}

function HistoryBody({ address, filter, setFilter }: { address: string; filter: Filter; setFilter: (f: Filter) => void }) {
  const all = useMemo(() => getHistory(address), [address]);
  const profile = getPlayer(address);
  const rounds = filter === "all" ? all : all.filter((r) => (filter === "wins" ? r.won : !r.won));
  const net = all.reduce((s, r) => s + r.net, 0);
  return (
    <div>
      <StatList
        columns={4}
        items={[
          { label: "Rounds", value: profile?.games.toLocaleString("en-US") ?? all.length },
          { label: "Won", value: profile?.wins.toLocaleString("en-US") ?? all.filter((r) => r.won).length },
          { label: "Largest win", value: `+${profile?.largestWin ?? 0}` },
          { label: "Recent net", value: `${net >= 0 ? "+" : "−"}${Math.abs(net)}`, hint: `last ${all.length} rounds` },
        ]}
      />
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filter rounds" className="inline-flex rounded-full border border-border bg-surface p-1 dark:bg-elevated">
          {(["all", "wins", "losses"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium capitalize transition-colors", filter === f ? "bg-ink text-canvas" : "text-muted hover:text-ink")}
            >
              {f}
            </button>
          ))}
        </div>
        <DemoBadge />
      </div>
      <RoundHistory rounds={rounds} className="mt-4" emptyLabel="Nothing matches this filter." />
    </div>
  );
}

export function MeRewards() {
  return (
    <MeShell title="Wins become rewards you choose." lede="Claim your win balance in supported crypto or Stock Tokens. Availability depends on inventory and liquidity.">
      {({ address }) => {
        const demo = getAccountDemo(address);
        const enabled = rewardRegistry.filter((t) => t.enabled);
        return (
          <div className="space-y-14">
            <RewardsPanel winBalance={demo.winBalance} />
            <section aria-labelledby="claims-title">
              <h2 id="claims-title" className="font-display text-3xl">
                Claims
              </h2>
              <ClaimsList claims={demo.claims} className="mt-4" />
            </section>
            <section aria-labelledby="assets-title">
              <div className="flex items-end justify-between gap-4">
                <h2 id="assets-title" className="font-display text-3xl">
                  Supported assets
                </h2>
                <Link href="/rewards" className="text-[13px] underline underline-offset-4 hover:text-ink">
                  Reward catalogue
                </Link>
              </div>
              <p className="mt-2 max-w-lg text-[13.5px] text-muted">
                {enabled.length === 0 ? "No reward asset is enabled yet. Each one is listed only once its contract address is verified." : `${enabled.length} enabled.`}
              </p>
              <ul className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                {rewardRegistry.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 bg-surface px-4 py-3.5 dark:bg-elevated">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-ink">{t.symbol}</p>
                      <p className="truncate text-[12px] text-muted">{t.name}</p>
                    </div>
                    <span className="shrink-0 text-[10.5px] uppercase tracking-[0.12em] text-faint">{t.enabled ? "Enabled" : t.liquidityStatus}</span>
                  </li>
                ))}
              </ul>
            </section>
            <p className="text-[12.5px] text-faint">
              Minimum payout per asset applies. Win balance shown as {formatUsd(demo.winBalance)} USD-equivalent.
            </p>
          </div>
        );
      }}
    </MeShell>
  );
}

export function MeChips() {
  return (
    <MeShell title="Chips are tokens. You hold them." lede="Six denominations, each an ERC-1155 id in your wallet. Buy at the cashier, wager at any table.">
      {({ address }) => {
        const demo = getAccountDemo(address);
        return <ChipsPanel chips={demo.chips} total={demo.chipTotal} detailed />;
      }}
    </MeShell>
  );
}
