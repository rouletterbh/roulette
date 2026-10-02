import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { TreasuryMetric } from "@/components/treasury/treasury-metric";
import { AllocationBar, PayoutBars } from "@/components/treasury/treasury-charts";
import { demoTreasury } from "@/lib/demo/data";
import { getMaximumSafeBet, availableBankroll } from "@/lib/risk/engine";
import { getRewardInventory, totalRewardInventoryUsd } from "@/lib/demo/rewards";
import { economicsDefaults } from "@/config/economics";
import { mulberry32 } from "@/lib/demo/prng";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = { title: "Treasury" };

export default function TreasuryPage() {
  const t = demoTreasury;
  const { available, safety } = availableBankroll(t);
  const safe = getMaximumSafeBet(t, 35);
  const inventory = totalRewardInventoryUsd();
  const totalAssets = t.bankroll + t.protocolReserve + inventory;
  const liabilities = t.reservedLiability + t.claimableRewards;
  const collateralization = liabilities > 0 ? (totalAssets / liabilities) * 100 : 999;
  const rnd = mulberry32(42);
  const history = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 3 + i));
    const wagers = 6 + rnd() * 30;
    return { day: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, wagers: Math.round(wagers * 100) / 100, payouts: Math.round(wagers * (0.82 + rnd() * 0.3) * 100) / 100 };
  });
  const totalPaid = history.reduce((s, h) => s + h.payouts, 0);
  const inv = getRewardInventory();

  return (
    <div className="container-edge py-16 md:py-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Eyebrow className="mb-4 block">Treasury</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">The books, open.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every limit on every table is derived from these numbers. When they grow, limits grow. Nobody tops up the bankroll by hand.</p>
        </div>
        <div className="flex items-center gap-3"><DemoBadge /><Badge tone="outline">Testnet</Badge></div>
      </div>

      {/* Live transparency */}
      <section className="mt-14 grid gap-6 md:grid-cols-3" aria-label="System health">
        <TreasuryMetric label="Treasury collateralization" value={Math.min(collateralization, 999)} format="pct" accent hint="total assets ÷ (reserved + claimable)" />
        <TreasuryMetric label="Current reserved liabilities" value={t.reservedLiability} hint={`${t.unsettledRounds} unsettled rounds`} />
        <TreasuryMetric label="Current payout capacity" value={safe.maxRoundExposure} hint="maximum net liability accepted per round" />
      </section>

      <section className="mt-16 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-4" aria-label="Treasury metrics">
        <TreasuryMetric label="Total treasury" value={totalAssets} hint="bankroll + protocol reserve + reward inventory" />
        <TreasuryMetric label="Available game liquidity" value={available} hint={`after ${formatUsd(safety)} safety reserve`} />
        <TreasuryMetric label="Reserved liabilities" value={t.reservedLiability} />
        <TreasuryMetric label="Claimable rewards" value={t.claimableRewards} hint="win balances awaiting claims" />
        <TreasuryMetric label="Protocol reserve" value={t.protocolReserve} hint="never used for payouts" />
        <TreasuryMetric label="Reward inventory" value={inventory} hint="USD-equivalent held in the vault" />
        <TreasuryMetric label="Unsettled games" value={t.unsettledRounds} format="int" />
        <TreasuryMetric label="Historical payouts · 30d" value={totalPaid} />
      </section>

      <section className="mt-20">
        <h2 className="font-display mb-2 text-3xl">Where the money sits</h2>
        <p className="mb-6 text-[13px] text-muted">Closed loop. Deposits split {economicsDefaults.payoutLiquidityBps / 100}% liquidity · {economicsDefaults.rewardInventoryBps / 100}% reward inventory · {economicsDefaults.protocolReserveBps / 100}% reserve · {economicsDefaults.platformFeeBps / 100}% fee. Configurable within safe bounds.</p>
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
      </section>

      <section className="mt-20">
        <h2 className="font-display mb-2 text-3xl">How a table limit is computed</h2>
        <dl className="mt-6 grid gap-y-3 rounded-2xl border border-border p-6 text-[14px] md:grid-cols-[1fr_auto] md:gap-x-8">
          <dt className="text-muted">Bankroll</dt><dd className="tnum md:text-right">{formatUsd(t.bankroll)}</dd>
          <dt className="text-muted">− reserved liabilities</dt><dd className="tnum md:text-right">{formatUsd(t.reservedLiability)}</dd>
          <dt className="text-muted">− claimable rewards</dt><dd className="tnum md:text-right">{formatUsd(t.claimableRewards)}</dd>
          <dt className="text-muted">− protocol reserve</dt><dd className="tnum md:text-right">{formatUsd(t.protocolReserve)}</dd>
          <dt className="text-muted">− safety reserve ({(t.safetyReserveBps ?? economicsDefaults.safetyReserveBps) / 100}%)</dt><dd className="tnum md:text-right">{formatUsd(safety)}</dd>
          <dt className="border-t border-hairline pt-3 font-medium">= available bankroll</dt><dd className="border-t border-hairline pt-3 tnum font-medium md:text-right">{formatUsd(available)}</dd>
          <dt className="text-muted">× per-round exposure cap ({(t.maxRoundExposureBps ?? economicsDefaults.maxRoundExposureBps) / 100}%)</dt><dd className="tnum md:text-right">{formatUsd(safe.maxRoundExposure)}</dd>
          <dt className="text-muted">÷ 35 (straight-up payout)</dt><dd className="tnum md:text-right font-medium">{formatUsd(safe.maxStake)} max straight bet</dd>
        </dl>
        <p className="mt-4 text-[12.5px] text-muted">A wager is accepted only if its worst-case payout across all 37 outcomes fits under the per-round cap. See <Link href="/technology" className="underline underline-offset-2">Technology</Link>.</p>
      </section>

      <section className="mt-20">
        <h2 className="font-display mb-6 text-3xl">Wagers and payouts, last 30 days</h2>
        <PayoutBars data={history} />
      </section>

      <section className="mt-20">
        <h2 className="font-display mb-6 text-3xl">Reward inventory</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead><tr className="text-left text-muted"><th className="border-b border-border py-2 font-medium">Asset</th><th className="border-b border-border py-2 font-medium">Category</th><th className="border-b border-border py-2 text-right font-medium">Inventory</th><th className="border-b border-border py-2 text-right font-medium">Min. claim</th><th className="border-b border-border py-2 text-right font-medium">Status</th></tr></thead>
            <tbody>
              {inv.map((r) => (
                <tr key={r.token.id}>
                  <td className="border-b border-hairline py-2.5 font-medium">{r.token.symbol} <span className="font-normal text-muted">{r.token.name}</span></td>
                  <td className="border-b border-hairline py-2.5 text-muted">{r.token.category === "stock-token" ? "Stock Token" : "Ecosystem"}</td>
                  <td className="border-b border-hairline py-2.5 text-right tnum">{r.inventoryUsd > 0 ? formatUsd(r.inventoryUsd) : "—"}</td>
                  <td className="border-b border-hairline py-2.5 text-right tnum">{formatUsd(r.token.minimumPayout)}</td>
                  <td className="border-b border-hairline py-2.5 text-right"><Badge tone={r.status === "available" ? "accent" : r.status === "low" ? "amber" : "outline"}>{r.statusLabel}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
