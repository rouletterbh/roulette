import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { ProtocolHealth } from "@/components/agent/protocol-health";
import { TreasuryMetric } from "@/components/treasury/treasury-metric";
import { ActiveLiabilities } from "@/components/treasury/active-liabilities";
import { AllocationBar, PayoutBars } from "@/components/treasury/treasury-charts";
import { demoTreasury } from "@/lib/demo/data";
import { getMaximumSafeBet, availableBankroll } from "@/lib/risk/engine";
import { getRewardInventory, totalRewardInventoryUsd } from "@/lib/demo/rewards";
import { economicsDefaults } from "@/config/economics";
import { mulberry32 } from "@/lib/demo/prng";
import { cn, formatUsd } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { activeChain } from "@/config/chains";
import { SectionHead } from "@/components/treasury/section-head";
import { ChainTreasury } from "@/components/treasury/chain-treasury";

export const metadata: Metadata = { title: "Treasury" };

export default function TreasuryPage() {
  return siteConfig.demoMode ? <DemoTreasuryPage /> : <ChainTreasuryPage />;
}

/**
 * Demo-off: the page shell stays server-rendered; every figure is read from the
 * contracts on Robinhood Chain by <ChainTreasury /> (client). No simulated rows,
 * no "Testnet" label on mainnet, no demo network wording.
 */
function ChainTreasuryPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <header className="blueprint">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <Eyebrow className="mb-4 block" live>Treasury</Eyebrow>
            <h1 className="font-display text-display-lg text-balance">The house cannot bet what it cannot pay.</h1>
            <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every limit on every table is derived from these numbers, read live from the treasury contract. When they grow, limits grow. Nobody tops up the bankroll by hand.</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="outline">{activeChain.name}</Badge>
            <Badge tone="outline" className="tnum">chain {activeChain.id}</Badge>
          </div>
        </div>
      </header>
      <ChainTreasury />
    </div>
  );
}

/** Demo mode: simulated treasury (unchanged). */
function DemoTreasuryPage() {
  const t = demoTreasury;
  const { available, safety } = availableBankroll(t);
  const safe = getMaximumSafeBet(t, 35);
  const inventory = totalRewardInventoryUsd();
  const totalAssets = t.bankroll + t.protocolReserve + inventory;
  const liabilities = t.reservedLiability + t.claimableRewards;
  const collateralization = liabilities > 0 ? (totalAssets / liabilities) * 100 : 999;
  const safetyBps = t.safetyReserveBps ?? economicsDefaults.safetyReserveBps;
  const capBps = t.maxRoundExposureBps ?? economicsDefaults.maxRoundExposureBps;
  /** Mean reserved liability per unsettled round, as a share of available bankroll (the cap is capBps of the same base). */
  const roundExposurePct = available > 0 && t.unsettledRounds > 0 ? (t.reservedLiability / t.unsettledRounds / available) * 100 : 0;
  const rnd = mulberry32(42);
  const history = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 3 + i));
    const wagers = 6 + rnd() * 30;
    return { day: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, wagers: Math.round(wagers * 100) / 100, payouts: Math.round(wagers * (0.82 + rnd() * 0.3) * 100) / 100 };
  });
  const totalPaid = history.reduce((s, h) => s + h.payouts, 0);
  const inv = getRewardInventory();

  const derivation: Array<[string, string, "sum" | "result" | undefined]> = [
    ["Bankroll", formatUsd(t.bankroll), undefined],
    ["− reserved liabilities", formatUsd(t.reservedLiability), undefined],
    ["− claimable rewards", formatUsd(t.claimableRewards), undefined],
    ["− protocol reserve", formatUsd(t.protocolReserve), undefined],
    [`− safety reserve (${safetyBps / 100}%)`, formatUsd(safety), undefined],
    ["= available bankroll", formatUsd(available), "sum"],
    [`× per-round exposure cap (${capBps / 100}%)`, formatUsd(safe.maxRoundExposure), undefined],
    ["÷ 35 (straight-up payout)", `${formatUsd(safe.maxStake)} max straight bet`, "result"],
  ];

  return (
    <div className="container-edge py-16 md:py-24">
      {/* Header */}
      <header className="blueprint">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <Eyebrow className="mb-4 block">Treasury</Eyebrow>
            <h1 className="font-display text-display-lg text-balance">The house cannot bet what it cannot pay.</h1>
            <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every limit on every table is derived from these numbers. When they grow, limits grow. Nobody tops up the bankroll by hand.</p>
          </div>
          <div className="flex items-center gap-3">
            <DemoBadge />
            <Badge tone="outline">Testnet</Badge>
          </div>
        </div>
      </header>

      {/* Instrument row */}
      <section className="mt-12 flex flex-col gap-3 border-y border-hairline py-3 md:flex-row md:items-center md:justify-between" aria-label="Protocol health">
        <ProtocolHealth collateralizationPct={collateralization} exposurePct={roundExposurePct} capacityUsd={safe.maxRoundExposure} reservedUsd={t.reservedLiability} />
        <span className="microlabel tnum">Snapshot · {t.unsettledRounds} unsettled rounds</span>
      </section>

      {/* Metric grid */}
      <section className="mt-10 grid grid-cols-2 gap-px border-y border-hairline bg-hairline lg:grid-cols-3 xl:grid-cols-6" aria-label="Treasury metrics">
        <TreasuryMetric index="01" label="Available bankroll" value={available} hint={`after ${formatUsd(safety)} safety reserve`} accent />
        <TreasuryMetric index="02" label="Reserved" value={t.reservedLiability} hint={`${t.unsettledRounds} unsettled rounds`} />
        <TreasuryMetric index="03" label="Claimable" value={t.claimableRewards} hint="win balances awaiting claims" />
        <TreasuryMetric index="04" label="Protocol reserve" value={t.protocolReserve} hint="never used for payouts" />
        <TreasuryMetric index="05" label="Round exposure" value={safe.maxRoundExposure} hint={`cap · ${capBps / 100}% of available`} />
        <TreasuryMetric index="06" label="Max safe wager" value={safe.maxStake} hint="straight-up · exposure ÷ 35" />
      </section>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Secondary metrics">
        {(
          [
            ["Total treasury", formatUsd(totalAssets), "bankroll + reserve + inventory"],
            ["Collateralization", `${Math.min(collateralization, 999).toFixed(1)}%`, "assets ÷ (reserved + claimable)"],
            ["Reward inventory", formatUsd(inventory), "USD-equivalent in vault"],
            ["Unsettled rounds", String(t.unsettledRounds), "in flight"],
            ["Payouts · 30d", formatUsd(totalPaid), "historical"],
          ] as const
        ).map(([k, v, h]) => (
          <div key={k} className="min-w-0">
            <dt className="microlabel">{k}</dt>
            <dd className="mt-1 font-mono text-[13px] tnum text-ink">{v}</dd>
            <dd className="font-mono text-[10px] text-faint">{h}</dd>
          </div>
        ))}
      </dl>

      {/* Active liabilities */}
      <section className="mt-20">
        <SectionHead n="01 / Liabilities" title="Active liabilities" note="Open rounds currently reserving capacity against the per-round cap. Each row is a table round in the demo network; status follows the commit–reveal phase." />
        <ActiveLiabilities capUsd={safe.maxRoundExposure} className="mt-6" />
      </section>

      {/* Allocation */}
      <section className="mt-20">
        <SectionHead
          n="02 / Allocation"
          title="Where the money sits"
          note={`Closed loop. Deposits split ${economicsDefaults.payoutLiquidityBps / 100}% liquidity · ${economicsDefaults.rewardInventoryBps / 100}% reward inventory · ${economicsDefaults.protocolReserveBps / 100}% reserve · ${economicsDefaults.platformFeeBps / 100}% fee. Configurable within safe bounds.`}
        />
        <div className="mt-6">
          <AllocationBar
            total={totalAssets}
            parts={[
              { label: "Available liquidity", value: available },
              { label: "Reserved liabilities", value: t.reservedLiability },
              { label: "Safety reserve", value: safety },
              { label: "Protocol reserve", value: t.protocolReserve },
              { label: "Reward inventory", value: inventory },
            ]}
          />
        </div>
      </section>

      {/* Derivation */}
      <section className="mt-20">
        <SectionHead n="03 / Derivation" title="How a table limit is computed" />
        <dl className="mt-6 divide-y divide-hairline border-y border-hairline text-[14px]">
          {derivation.map(([k, v, kind]) => (
            <div key={k} className={cn("grid grid-cols-[1fr_auto] items-baseline gap-x-6 py-3", kind === "sum" && "border-t border-border")}>
              <dt className={cn(kind ? "text-ink" : "text-muted", kind === "sum" && "font-medium")}>{k}</dt>
              <dd className={cn("font-mono text-[13px] tnum text-right", kind ? "text-ink" : "text-ink-2", kind === "result" && "font-medium")}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[12.5px] text-muted">
          A wager is accepted only if its worst-case payout across all 37 outcomes fits under the per-round cap. See{" "}
          <Link href="/technology" className="underline underline-offset-2">
            Technology
          </Link>
          .
        </p>
      </section>

      {/* 30-day chart */}
      <section className="mt-20">
        <SectionHead n="04 / Flow" title="Wagers and payouts, last 30 days" note="Payouts are what the treasury returned to players; wagers are what it accepted." />
        <div className="mt-6">
          <PayoutBars data={history} />
        </div>
      </section>

      {/* Inventory */}
      <section className="mt-20">
        <SectionHead n="05 / Inventory" title="Reward inventory" />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead>
              <tr className="text-left">
                <th className="microlabel border-b border-border py-2 font-normal">Asset</th>
                <th className="microlabel border-b border-border py-2 font-normal">Category</th>
                <th className="microlabel border-b border-border py-2 text-right font-normal">Inventory</th>
                <th className="microlabel border-b border-border py-2 text-right font-normal">Min. claim</th>
                <th className="microlabel border-b border-border py-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {inv.map((r) => (
                <tr key={r.token.id}>
                  <td className="border-b border-hairline py-2.5 font-medium">
                    {r.token.symbol} <span className="font-normal text-muted">{r.token.name}</span>
                  </td>
                  <td className="border-b border-hairline py-2.5 text-muted">{r.token.category === "stock-token" ? "Stock Token" : "Ecosystem"}</td>
                  <td className="border-b border-hairline py-2.5 text-right font-mono text-[12.5px] tnum">{r.inventoryUsd > 0 ? formatUsd(r.inventoryUsd) : "—"}</td>
                  <td className="border-b border-hairline py-2.5 text-right font-mono text-[12.5px] tnum">{formatUsd(r.token.minimumPayout)}</td>
                  <td className="border-b border-hairline py-2.5 text-right">
                    <span className="microlabel inline-flex items-center gap-1.5 !text-ink">
                      <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "available" ? "bg-accent" : r.status === "low" ? "bg-agent-warn" : "bg-faint")} aria-hidden />
                      {r.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
