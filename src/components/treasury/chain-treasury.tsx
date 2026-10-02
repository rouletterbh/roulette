"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ProtocolHealth } from "@/components/agent/protocol-health";
import { TreasuryMetric } from "@/components/treasury/treasury-metric";
import { SectionHead } from "@/components/treasury/section-head";
import { ChainActiveLiabilities } from "@/components/treasury/chain-active-liabilities";
import { ChainRewardInventory } from "@/components/treasury/chain-reward-inventory";
import { AllocationBar, PayoutBars } from "@/components/treasury/treasury-charts";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useLatestRounds, useRewardInventoryAll, useSettledRounds, useTreasurySnapshot, useVaultTotals } from "@/lib/web3/hooks";
import { ROUND_SCAN_BLOCKS, contractAddresses } from "@/lib/web3/contracts";
import { buildFlowSeries, buildLiabilityRows, buildRewardRows, buildTreasuryView, formatEth, totalRewardInventoryUsd, type Money } from "@/lib/web3/treasury-view";
import { explorerAddress } from "@/config/chains";
import { cn, formatUsd } from "@/lib/utils";

/**
 * Treasury page body when demo mode is off. Every figure comes from CasinoTreasury,
 * RouletteGame and RewardVault views on Robinhood Chain (polled at CHAIN_POLL_MS).
 * USD is derived from the treasury's own chip peg (chipUsdValue); there is no
 * ETH/USD oracle on chain and none is invented. Sections render "—" until the first
 * read lands so server and client markup agree.
 */
export function ChainTreasury() {
  const mounted = useMounted();
  const treasury = useTreasurySnapshot();
  const rounds = useLatestRounds();
  const vault = useVaultTotals();
  const inventory = useRewardInventoryAll();
  const settled = useSettledRounds();

  const ready = mounted && treasury.isFetched;
  const view = useMemo(() => buildTreasuryView(treasury.raw), [treasury.raw]);
  const liabilityRows = useMemo(() => buildLiabilityRows(rounds.rounds, view.exposureCap.units, treasury.raw.chipUsdValue), [rounds.rounds, view.exposureCap.units, treasury.raw.chipUsdValue]);
  const rewardRows = useMemo(() => buildRewardRows(inventory.byAddress), [inventory.byAddress]);
  const inventoryUsd = totalRewardInventoryUsd(rewardRows);
  const flow = useMemo(() => buildFlowSeries(settled.logs, treasury.raw.chipUsdValue), [settled.logs, treasury.raw.chipUsdValue]);
  const unsettled = liabilityRows.length;
  const hasPeg = view.hasPeg;

  const money = (m: Money) => (!ready ? "—" : hasPeg ? formatUsd(m.usd) : formatEth(m.wei));
  const sub = (m: Money) => (!ready ? "" : hasPeg ? `${formatEth(m.wei)} · ${m.units.toLocaleString("en-US")} units` : "chip peg not read");
  const winBalance = vault.totalWinBalanceUsd1e18;
  const configured = !!contractAddresses.treasury;

  return (
    <>
      {/* Instrument row */}
      <section className="mt-12 flex flex-col gap-3 border-y border-hairline py-3 md:flex-row md:items-center md:justify-between" aria-label="Protocol health">
        {ready && view.collateralizationPct != null && view.exposurePct != null ? (
          <ProtocolHealth collateralizationPct={view.collateralizationPct} exposurePct={view.exposurePct} capacityUsd={view.exposureCap.usd} reservedUsd={view.reserved.usd} />
        ) : (
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {(
              [
                ["Solvent", !ready ? "—" : view.isSolvent ? "yes" : "NO"],
                ["Round exposure", !ready ? "—" : view.exposurePct == null ? "—" : `${view.exposurePct.toFixed(1)}%`],
                ["Payout capacity", money(view.exposureCap)],
                ["Reserved", money(view.reserved)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", ready && (k !== "Solvent" || view.isSolvent) ? "bg-accent" : "bg-agent-warn")} aria-hidden />
                <dt className="microlabel">{k}</dt>
                <dd className="font-mono text-[12px] tnum text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <span className="microlabel tnum">{!ready ? "Reading Robinhood Chain…" : `Live · ${unsettled} unsettled ${unsettled === 1 ? "round" : "rounds"} · ${view.isSolvent ? "solvent" : "INSOLVENT"}`}</span>
      </section>

      {!configured && (
        <p className="mt-6 text-[13px] text-muted">Treasury address not configured (NEXT_PUBLIC_TREASURY_ADDRESS). Nothing to read.</p>
      )}
      {ready && treasury.error && <p className="mt-6 text-[13px] text-casino-red">Could not read the treasury: {treasury.error.message}</p>}

      {/* Metric grid */}
      <section className="mt-10 grid grid-cols-2 gap-px border-y border-hairline bg-hairline lg:grid-cols-3 xl:grid-cols-6" aria-label="Treasury metrics">
        <TreasuryMetric index="01" label="Available bankroll" value={money(view.available)} hint={ready ? `after ${money(view.safetyReserve)} safety reserve · ${sub(view.available)}` : "reading…"} accent />
        <TreasuryMetric index="02" label="Reserved" value={money(view.reserved)} hint={ready ? `${unsettled} unsettled ${unsettled === 1 ? "round" : "rounds"} · ${sub(view.reserved)}` : "reading…"} />
        <TreasuryMetric index="03" label="Claimable" value={money(view.claimable)} hint={ready ? `win balances awaiting claims · ${sub(view.claimable)}` : "reading…"} />
        <TreasuryMetric index="04" label="Protocol reserve" value={money(view.protocolReserve)} hint={ready ? `never used for payouts · ${sub(view.protocolReserve)}` : "reading…"} />
        <TreasuryMetric index="05" label="Round exposure" value={money(view.exposureCap)} hint={ready ? `cap · ${view.maxRoundExposureBps / 100}% of available · ${sub(view.exposureCap)}` : "reading…"} />
        <TreasuryMetric index="06" label="Max safe wager" value={!ready ? "—" : hasPeg ? formatUsd(view.maxStraightUsd) : "—"} hint={ready ? `straight-up · exposure ÷ 35 · ${view.maxStraightUnits.toLocaleString("en-US")} units` : "reading…"} />
      </section>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Secondary metrics">
        {(
          [
            ["Total treasury", money(view.totalTreasury), "bankroll + reserve + inventory ETH"],
            ["Collateralization", !ready ? "—" : view.collateralizationPct == null ? "no liabilities" : `${Math.min(view.collateralizationPct, 999).toFixed(1)}%`, "(bankroll + reserve) ÷ (reserved + claimable)"],
            ["Reward inventory", !mounted || !inventory.isFetched ? "—" : formatUsd(inventoryUsd), inventory.enabled ? "vault tokens × posted oracle price" : "vault not configured"],
            ["Win balances", !mounted || !vault.isFetched ? "—" : winBalance == null ? "no view" : formatUsd(Number(winBalance) / 1e18), "RewardVault.totalWinBalance"],
            ["Payouts · scanned", !mounted || !settled.scanned ? "—" : formatUsd(flow.payoutsUsd), settled.window ? `${flow.rounds} settled rounds · blocks ${settled.window.fromBlock}–${settled.window.toBlock}` : `last ${ROUND_SCAN_BLOCKS} blocks`],
          ] as const
        ).map(([k, v, h]) => (
          <div key={k} className="min-w-0">
            <dt className="microlabel">{k}</dt>
            <dd className="mt-1 font-mono text-[13px] tnum text-ink">{v}</dd>
            <dd className="font-mono text-[10px] text-faint">{h}</dd>
          </div>
        ))}
      </dl>

      <p className="microlabel mt-4">
        {ready && hasPeg ? `USD at the chip peg · 1 unit = ${formatUsd(view.chipUsd)} = ${view.chipPriceWei.toString()} wei · no ETH/USD oracle on chain` : "USD figures appear once the chip peg (CasinoTreasury.chipUsdValue) is read"}
        {contractAddresses.treasury && (
          <>
            {" · "}
            <a href={explorerAddress(contractAddresses.treasury)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              CasinoTreasury ↗
            </a>
          </>
        )}
      </p>

      {/* Active liabilities */}
      <section className="mt-20">
        <SectionHead n="01 / Liabilities" title="Active liabilities" note="Rounds currently reserving capacity against the per-round cap, read from RouletteGame.getRound for the latest round of each table. Status follows the commit–reveal phase." />
        <ChainActiveLiabilities rows={liabilityRows} scanned={mounted && rounds.scanned && !rounds.isLoading} hasPeg={ready && hasPeg} className="mt-6" />
        {mounted && rounds.error && <p className="mt-3 text-[12.5px] text-casino-red">Round scan failed: {rounds.error.message}</p>}
      </section>

      {/* Allocation */}
      <section className="mt-20">
        <SectionHead
          n="02 / Allocation"
          title="Where the money sits"
          note={
            treasury.split
              ? `Closed loop. Deposits split ${treasury.split.payoutLiquidityBps / 100}% liquidity · ${treasury.split.rewardInventoryBps / 100}% reward inventory · ${treasury.split.protocolReserveBps / 100}% reserve · ${treasury.split.platformFeeBps / 100}% fee (CasinoTreasury.splitConfig).`
              : "Closed loop. Deposit split is read from CasinoTreasury.splitConfig."
          }
        />
        <div className="mt-6">
          {ready && hasPeg && view.totalTreasury.usd > 0 ? (
            <AllocationBar total={view.allocation.reduce((s, p) => s + p.value, 0)} parts={view.allocation} />
          ) : (
            <p className="text-[13px] text-muted">{ready ? "Nothing allocated yet." : "Reading Robinhood Chain…"}</p>
          )}
        </div>
      </section>

      {/* Derivation */}
      <section className="mt-20">
        <SectionHead n="03 / Derivation" title="How a table limit is computed" />
        <dl className="mt-6 divide-y divide-hairline border-y border-hairline text-[14px]">
          {view.derivation.map(([k, v, kind]) => (
            <div key={k} className={cn("grid grid-cols-[1fr_auto] items-baseline gap-x-6 py-3", kind === "sum" && "border-t border-border")}>
              <dt className={cn(kind ? "text-ink" : "text-muted", kind === "sum" && "font-medium")}>{k}</dt>
              <dd className={cn("font-mono text-[13px] tnum text-right", kind ? "text-ink" : "text-ink-2", kind === "result" && "font-medium")}>{ready ? v : "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[12.5px] text-muted">
          A wager is accepted only if its worst-case payout across all 37 outcomes fits under the per-round cap (RiskEngine.checkWager). See{" "}
          <Link href="/technology" className="underline underline-offset-2">
            Technology
          </Link>
          .
        </p>
      </section>

      {/* Flow */}
      <section className="mt-20">
        <SectionHead
          n="04 / Flow"
          title="Wagers and payouts, recent settled rounds"
          note={`Per settled round, from RouletteGame.RoundSettled events in the last ${ROUND_SCAN_BLOCKS.toLocaleString("en-US")} blocks. Payouts are what the treasury returned to players; wagers are what it accepted.`}
        />
        <div className="mt-6">
          {!mounted || !settled.scanned ? (
            <p className="text-[13px] text-muted">Reading Robinhood Chain…</p>
          ) : flow.points.length === 0 ? (
            <p className="text-[13px] text-muted">History appears as rounds settle.{settled.error ? ` (scan failed: ${settled.error.message})` : ""}</p>
          ) : (
            <>
              <PayoutBars data={flow.points} />
              <p className="microlabel mt-3 tnum">
                {flow.rounds} settled rounds · wagers {formatUsd(flow.wagersUsd)} · payouts {formatUsd(flow.payoutsUsd)}
              </p>
            </>
          )}
        </div>
      </section>

      {/* Inventory */}
      <section className="mt-20">
        <SectionHead n="05 / Inventory" title="Reward inventory" note="Read from RewardVault (status, inventory, quote). A USD figure appears only when the vault's oracle holds a fresh posted price for that asset. Stock Tokens are not listed." />
        <div className="mt-6">
          <ChainRewardInventory rows={rewardRows} fetched={inventory.enabled ? inventory.isFetched : true} />
          {!inventory.enabled && <p className="mt-3 text-[12.5px] text-muted">Reward vault address not configured (NEXT_PUBLIC_REWARD_VAULT_ADDRESS); ecosystem assets show as unavailable.</p>}
        </div>
      </section>
    </>
  );
}
