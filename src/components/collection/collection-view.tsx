"use client";

import Link from "next/link";
import { MeShell } from "@/components/account/me-shell";
import { useCollection, summarize, type Acquisition } from "@/store/collection";
import { getRewardInventory } from "@/lib/demo/rewards";
import { Button } from "@/components/ui/button";
import { AgentCollectionEvent } from "@/components/agent/agent-collection-event";
import { Figure, Reveal, TechSection, fmtStamp } from "@/components/agent/agent-page-kit";
import { agentCode } from "@/lib/agent/states";
import { cn, formatUsd, formatNumber } from "@/lib/utils";

/* ------------------------------------------------------------------
   YOUR COLLECTION. Everything your agents walked away with, as a ledger:
   asset, source machine, round, date, value at settlement, status and
   provenance. Values are what settled, not a projection. DEMO: 1 chip = $1.
------------------------------------------------------------------ */

type RowStatus = Acquisition["status"] | "claimed";

function statusLabel(s: RowStatus) {
  return s === "collected" ? "Collected" : s === "claimed" ? "Claimed" : "Settled";
}

export function CollectionView() {
  return (
    <MeShell title="Everything your agents walked away with." eyebrow="Your collection" lede="Every win an agent (or you) settled into an asset, with the round it came from. Values are recorded at settlement; nothing here is a projection.">
      {({ address }) => <CollectionBody owner={address} />}
    </MeShell>
  );
}

function CollectionBody({ owner }: { owner: string }) {
  const all = useCollection((s) => s.acquisitions);
  const rules = useCollection((s) => s.rules);
  const setRule = useCollection((s) => s.setRule);
  const acqs = all.filter((a) => a.owner === owner);
  const { holdings, totalUsd, diversity } = summarize(acqs);
  const sources = new Set(acqs.map((a) => a.agentId ?? "you")).size;
  const inv = getRewardInventory();
  const rule = rules[owner] ?? { primaryAssetId: null, fallbackAssetId: null };
  const sel = "h-9 rounded-none border-b border-border-strong bg-transparent px-1 font-mono text-[12px] uppercase tracking-[0.06em] outline-none focus:border-ink";
  const hasWinBalance = holdings.some((h) => !h.assetId);

  return (
    <div className="space-y-14">
      {/* Summary strip */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink py-6 md:grid-cols-4">
        <Figure label="Value at settlement" value={formatUsd(totalUsd)} note="1 chip = $1" />
        <Figure label="Acquisitions" value={acqs.length} />
        <Figure label="Distinct assets" value={diversity} />
        <Figure label="Source agents" value={sources} />
      </dl>

      {/* Default rule */}
      <Reveal>
        <TechSection index="01" title="Default collection rule" meta="Used by agents without their own">
          <div className="grid gap-6 md:grid-cols-12">
            <p className="text-[13px] leading-relaxed text-muted md:col-span-5">Wins settle into the first asset the vault actually holds. Only assets with inventory can be chosen; otherwise the win remains a balance you can claim.</p>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4 md:col-span-7">
              <label className="flex flex-col gap-1">
                <span className="microlabel">Collect as</span>
                <select value={rule.primaryAssetId ?? ""} onChange={(e) => setRule(owner, { ...rule, primaryAssetId: e.target.value || null })} className={sel}>
                  <option value="">Win balance</option>
                  {inv.map((i) => <option key={i.token.id} value={i.token.id} disabled={i.status !== "available" && i.status !== "low"}>{i.token.symbol} · {i.statusLabel}</option>)}
                </select>
              </label>
              <span className="microlabel pb-2.5">then</span>
              <label className="flex flex-col gap-1">
                <span className="microlabel">Fallback</span>
                <select value={rule.fallbackAssetId ?? ""} onChange={(e) => setRule(owner, { ...rule, fallbackAssetId: e.target.value || null })} className={sel}>
                  <option value="">Win balance</option>
                  {inv.map((i) => <option key={i.token.id} value={i.token.id} disabled={i.status !== "available" && i.status !== "low"}>{i.token.symbol} · {i.statusLabel}</option>)}
                </select>
              </label>
            </div>
          </div>
        </TechSection>
      </Reveal>

      {/* By asset */}
      <Reveal>
        <TechSection index="02" title="By asset" meta={hasWinBalance ? <Link href="/cashier?tab=claim" className="!text-ink hover:underline">Claim win balance →</Link> : `${holdings.length} held`}>
          {holdings.length === 0 ? (
            <div className="border border-dashed border-border-strong px-6 py-10 text-center">
              <p className="font-display text-2xl">Nothing collected yet.</p>
              <p className="mt-2 text-[13px] text-muted"><Link href="/agents/new" className="text-ink underline underline-offset-4">Author an agent</Link> and whatever it collects lands here with its round.</p>
            </div>
          ) : (
            <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {holdings.map((h) => (
                <li key={h.assetId ?? "win"} className="border-t border-hairline pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-3xl">{h.symbol}</span>
                    <span className="microlabel">{h.assetId ? "Collected" : "Settled · unclaimed"}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <div><dt className="microlabel">Value</dt><dd className="font-mono text-[12.5px] tnum">{formatUsd(h.usd)}</dd></div>
                    <div><dt className="microlabel">Count</dt><dd className="font-mono text-[12.5px] tnum">{h.count}</dd></div>
                    <div><dt className="microlabel">Qty</dt><dd className="font-mono text-[12.5px] tnum">{h.qty != null ? formatNumber(h.qty, { maximumFractionDigits: 6 }) : <span className="text-faint">at claim</span>}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </TechSection>
      </Reveal>

      {/* Ledger */}
      <Reveal>
        <TechSection index="03" title="Ledger" meta={acqs.length > 0 ? `${acqs.length} rows · newest first` : "Empty"}>
          {acqs.length === 0 ? (
            <p className="text-[13px] text-muted">No acquisitions yet.</p>
          ) : (
            <>
              {/* Desktop: technical table */}
              <div className="hidden md:block">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-hairline text-left">
                      {["Asset", "Source agent", "Round", "Date", "Value at settlement", "Status", "Provenance"].map((h, i) => (
                        <th key={h} scope="col" className={cn("py-2 pr-4 font-normal microlabel", i === 4 && "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {acqs.slice(0, 120).map((a) => (
                      <tr key={a.id} className="align-baseline">
                        <td className="py-2.5 pr-4">
                          <span className={cn("font-medium", a.status === "win-balance" ? "text-muted" : "text-ink")}>{a.symbol}</span>
                          <span className="ml-2 font-mono text-[11px] tnum text-faint">{formatNumber(a.chips)} chips</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          {a.agentId ? (
                            <Link href={`/agent/${a.agentId}`} className="hover:underline">
                              <span className="font-mono text-[11.5px] uppercase tracking-[0.06em]">{agentCode(a.agentId)}</span>
                              {a.agentName && <span className="ml-2 text-muted">{a.agentName}</span>}
                            </Link>
                          ) : <span className="text-muted">You</span>}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[12px] tnum"><Link href={`/fairness?round=${a.roundId}`} className="hover:underline">#{a.roundId}</Link><span className="ml-2 text-faint">→ {a.result}</span></td>
                        <td className="py-2.5 pr-4 font-mono text-[11.5px] tnum text-muted">{fmtStamp(a.at)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-[12.5px] tnum">{formatUsd(a.usd)}</td>
                        <td className="py-2.5 pr-4">
                          <span className="inline-flex items-center gap-1.5 microlabel !text-ink">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.status === "collected" ? "var(--agent-executing)" : "var(--agent-observing)" }} aria-hidden />
                            {statusLabel(a.status)}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <Link href={`/fairness?round=${a.roundId}`} className="inline-flex items-center gap-1.5 microlabel hover:!text-ink">
                            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M1.5 5.5 4 8l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                            Verified
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: event list */}
              <ol className="divide-y divide-hairline md:hidden">
                {acqs.slice(0, 60).map((a) => (
                  <li key={a.id}><AgentCollectionEvent agentName={a.agentName} agentId={a.agentId} roundId={a.roundId} result={a.result} chips={a.chips} usd={a.usd} symbol={a.symbol} status={a.status} /></li>
                ))}
              </ol>
            </>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-3">
            <p className="microlabel">Every row keeps the round it came from. Provenance is one click away.</p>
            {hasWinBalance && <Button href="/cashier?tab=claim" variant="outline" size="sm" className="font-mono text-[11px] uppercase tracking-[0.12em]">Claim win balance</Button>}
          </div>
        </TechSection>
      </Reveal>
    </div>
  );
}
