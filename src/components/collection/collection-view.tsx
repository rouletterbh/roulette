"use client";

import Link from "next/link";
import { MeShell } from "@/components/account/me-shell";
import { useCollection, summarize, useCollection as useCol } from "@/store/collection";
import { getRewardInventory } from "@/lib/demo/rewards";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { NumberPill } from "@/components/ui/number-pill";
import { Button } from "@/components/ui/button";
import { cn, formatUsd, formatNumber, relativeTime } from "@/lib/utils";

export function CollectionView() {
  return (
    <MeShell title="What you walked away with." eyebrow="Collection" lede="Every win your agents (or you) settled into an asset, with the round it came from. Agents play; this is what they put in your pocket.">
      {({ address }) => <CollectionBody owner={address} />}
    </MeShell>
  );
}

function CollectionBody({ owner }: { owner: string }) {
  const all = useCollection((s) => s.acquisitions);
  const rules = useCollection((s) => s.rules);
  const setRule = useCol((s) => s.setRule);
  const acqs = all.filter((a) => a.owner === owner);
  const { holdings, totalUsd, diversity } = summarize(acqs);
  const inv = getRewardInventory();
  const rule = rules[owner] ?? { primaryAssetId: null, fallbackAssetId: null };
  const sel = "h-9 rounded-lg border border-border bg-transparent px-3 text-[13px] outline-none focus:border-ink";

  return (
    <div className="space-y-12">
      <dl className="grid grid-cols-2 gap-6 border-y border-hairline py-6 md:grid-cols-4">
        <div><dt className="eyebrow mb-1 text-[10px]">Collected</dt><dd className="font-display text-3xl tnum">{formatUsd(totalUsd)}</dd></div>
        <div><dt className="eyebrow mb-1 text-[10px]">Acquisitions</dt><dd className="font-display text-3xl tnum">{acqs.length}</dd></div>
        <div><dt className="eyebrow mb-1 text-[10px]">Assets</dt><dd className="font-display text-3xl tnum">{diversity}</dd></div>
        <div className="flex items-end"><DemoBadge /></div>
      </dl>

      <section>
        <h2 className="font-display mb-2 text-3xl">Default collection rule</h2>
        <p className="mb-4 text-[13px] text-muted">Used by agents that don&apos;t set their own. Only assets the vault actually holds can be chosen.</p>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <label className="flex items-center gap-2">Collect as
            <select value={rule.primaryAssetId ?? ""} onChange={(e) => setRule(owner, { ...rule, primaryAssetId: e.target.value || null })} className={sel}>
              <option value="">Win balance</option>
              {inv.map((i) => <option key={i.token.id} value={i.token.id} disabled={i.status !== "available" && i.status !== "low"}>{i.token.symbol} · {i.statusLabel}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">then
            <select value={rule.fallbackAssetId ?? ""} onChange={(e) => setRule(owner, { ...rule, fallbackAssetId: e.target.value || null })} className={sel}>
              <option value="">Win balance</option>
              {inv.map((i) => <option key={i.token.id} value={i.token.id} disabled={i.status !== "available" && i.status !== "low"}>{i.token.symbol} · {i.statusLabel}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2 className="font-display mb-4 text-3xl">Holdings</h2>
        {holdings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-[13.5px] text-muted">
            Nothing collected yet. <Link href="/play/quick" className="text-ink underline underline-offset-2">Author an agent</Link> and its wins will land here.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {holdings.map((h) => (
              <li key={h.assetId ?? "win"} className="rounded-2xl border border-border bg-surface p-5 dark:bg-elevated">
                <div className="flex items-start justify-between">
                  <div className="font-display text-3xl">{h.symbol}</div>
                  <Badge tone={h.assetId ? "accent" : "outline"}>{h.assetId ? "Collected" : "Win balance"}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-1 text-[12.5px] tnum">
                  <dt className="text-muted">Value</dt><dd className="text-right">{formatUsd(h.usd)}</dd>
                  <dt className="text-muted">Acquisitions</dt><dd className="text-right">{h.count}</dd>
                  <dt className="text-muted">Quantity</dt><dd className="text-right">{h.qty != null ? formatNumber(h.qty, { maximumFractionDigits: 6 }) : <span className="text-faint">settled at claim</span>}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
        {holdings.some((h) => !h.assetId) && <div className="mt-4"><Button href="/cashier?tab=claim" variant="outline" size="sm">Claim win balance</Button></div>}
      </section>

      <section>
        <h2 className="font-display mb-4 text-3xl">Timeline</h2>
        {acqs.length === 0 ? <p className="text-[13px] text-muted">No acquisitions yet.</p> : (
          <ol className="divide-y divide-hairline">
            {acqs.slice(0, 60).map((a) => (
              <li key={a.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3 text-[13px]">
                <NumberPill n={a.result} size="sm" />
                <div className="min-w-0">
                  <div className="truncate">
                    {a.agentName ? <Link href={`/agent/${a.agentId}`} className="font-medium underline-offset-2 hover:underline">{a.agentName}</Link> : <span className="font-medium">You</span>}
                    {" "}won <span className="tnum">{formatNumber(a.chips)}</span> chips → <span className={cn("font-medium", a.status === "collected" ? "text-ink" : "text-muted")}>{a.symbol}</span>
                  </div>
                  <div className="text-[11.5px] text-muted">Round #{a.roundId} · <Link href={`/fairness?round=${a.roundId}`} className="underline-offset-2 hover:underline">proof</Link></div>
                </div>
                <div className="text-right tnum"><div>{formatUsd(a.usd)}</div><div className="text-[11px] text-faint">{relativeTime(a.at)}</div></div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
