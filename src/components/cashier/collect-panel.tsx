"use client";

import { useState } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenLogo } from "@/components/layout/brand-logo";
import { explorerTx } from "@/config/chains";
import { cn, formatNumber, formatUsd } from "@/lib/utils";
import { track, bucketAmount } from "@/lib/analytics/events";
import { useChipApproval, useCollectState, useNowSeconds, type CollectAsset } from "@/lib/web3/hooks";
import { claimAs, convertToRewards, deadlineIn, quoteClaim, readClaimReceipt, withSlippage } from "@/lib/web3/actions";
import { CLAIM_DEADLINE_MINUTES, CLAIM_SLIPPAGE_BPS, convertCreditUsd1e18, tokensForUsd } from "@/lib/web3/claim-math";
import { PAUSE_FLAGS, selectChips, type ChipBalances } from "@/lib/web3/contracts";
import type { TxSpec } from "@/lib/web3/use-tx-flow";
import { RESTOCK_NOTE, ageLabel, claimAmount, collectRow, tokenLabel, usdFloor } from "./collect-view";

/**
 * The cashier's Claim tab with the chain as the only source: a two-step collect flow.
 *   1. Convert chips to a win balance (CasinoTreasury.convertToRewards, one-way).
 *   2. Claim the win balance as a reward asset (RewardVault.claimAs), never more than
 *      min(win balance, vault inventory × posted price).
 */
const usdNum = (v: bigint) => Number(formatUnits(v, 18));
const STATUS_LABEL = { available: "Available", low: "Low", unavailable: "Unavailable" } as const;

export interface CollectPanelProps {
  address: Address;
  chips: { balances: ChipBalances; units: number; refetch: () => unknown };
  escrowUnits: number;
  win: { usd1e18: bigint; isFetched: boolean; refetch: () => unknown };
  chipUsdValue: bigint;
  /** Wrong network, missing addresses or a transaction in flight. */
  blocked: boolean;
  /** Treasury-side pause flags already read by the cashier. */
  treasuryPauseFlags: number;
  open: (spec: TxSpec) => void;
  record: (label: string, hash: Hex) => void;
  refetchTreasury: () => void;
}

export function CollectPanel({ address, chips, escrowUnits, win, chipUsdValue, blocked, treasuryPauseFlags, open, record, refetchTreasury }: CollectPanelProps) {
  const collect = useCollectState();
  const approval = useChipApproval(address);
  const now = useNowSeconds();

  const paused = ((collect.pauseFlags | treasuryPauseFlags) & PAUSE_FLAGS.claims) !== 0;

  /* ------------------------------------------------------------ 1. convert */
  const [convertInput, setConvertInput] = useState<number | null>(null);
  const convertUnits = Math.min(convertInput ?? chips.units, chips.units);
  const selection = selectChips(chips.balances, convertUnits);
  const creditUsd1e18 = convertCreditUsd1e18(convertUnits, chipUsdValue);
  const chipUsd = usdNum(chipUsdValue);
  const [lastConvert, setLastConvert] = useState<{ units: number; usd: number; hash: Hex } | null>(null);
  const canConvert = !blocked && !paused && collect.vaultLinked && convertUnits >= 1 && selection.exact && chipUsdValue > 0n;

  const openConvert = () => {
    const units = convertUnits;
    const usd = usdNum(creditUsd1e18);
    open({
      title: "Convert chips",
      summary: [
        ["Burn", `${formatNumber(units)} chips`],
        ["Win balance credit", formatUsd(usd)],
        ["Then", "claim as a reward asset"],
        ["One-way", "cannot be withdrawn as ETH"],
      ],
      needsApproval: !approval.approved,
      run: (report) => convertToRewards(chips.balances, units, report),
      onSuccess: async (hash) => {
        record("Convert chips", hash);
        setLastConvert({ units, usd, hash });
        setConvertInput(null);
        refetchTreasury();
        collect.refetch();
        await Promise.all([chips.refetch(), win.refetch(), approval.refetch()]);
      },
    });
  };

  /* -------------------------------------------------------------- 2. claim */
  const [assetId, setAssetId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [lastClaim, setLastClaim] = useState<{ symbol: string; tokens: string | null; usd: number; hash: Hex } | null>(null);
  const rows = collect.assets.map((a) => ({ asset: a, row: collectRow(a, win.usd1e18) }));
  const picked = rows.find((r) => r.asset.id === assetId && r.row.claimable) ?? null;
  const amount = picked ? claimAmount(amountInput, picked.row.limit.maxUsd1e18, picked.asset.minimumPayoutUsd1e18) : null;
  const estimate = picked && amount && picked.asset.priceUsd1e18 ? tokensForUsd(amount.usd1e18, picked.asset.priceUsd1e18, picked.asset.decimals) : null;
  const canClaim = !blocked && !paused && !!picked && !!amount && amount.error === null && amount.usd1e18 > 0n;

  const openClaim = () => {
    if (!picked || !amount || amount.error) return;
    const a = picked.asset;
    const usd1e18 = amount.usd1e18;
    const usd = usdNum(usd1e18);
    track("claim_start", { amount: bucketAmount(usd) });
    open({
      title: "Claim",
      summary: [
        ["Amount", usdFloor(usd1e18)],
        ["Asset", a.symbol],
        ["Estimated", estimate != null ? `${tokenLabel(estimate, a.decimals)} ${a.symbol}` : "quoted at claim"],
        ["Slippage tolerance", `${CLAIM_SLIPPAGE_BPS / 100}%`],
      ],
      run: async (report) => {
        const q = await quoteClaim(a.address, usd1e18);
        return claimAs(a.address, usd1e18, withSlippage(q.amountOut, CLAIM_SLIPPAGE_BPS), deadlineIn(CLAIM_DEADLINE_MINUTES), report);
      },
      onSuccess: async (hash) => {
        record(`Claim ${a.symbol}`, hash);
        track("claim_complete", { amount: bucketAmount(usd) });
        const paid = await readClaimReceipt(hash);
        setLastClaim({ symbol: a.symbol, tokens: paid ? tokenLabel(paid.amountOut, a.decimals) : null, usd, hash });
        setAssetId(null);
        setAmountInput("");
        collect.refetch();
        await win.refetch();
      },
    });
  };

  const field = "h-12 w-full rounded-xl border border-border bg-surface px-4 text-[18px] tnum outline-none focus:border-ink dark:bg-elevated disabled:opacity-50";
  const line = (k: string, v: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-2.5 text-[13.5px]">
      <span className="text-muted">{k}</span>
      <span className="tnum text-right">{v}</span>
    </div>
  );
  const receipt = "mt-4 flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline px-4 py-2.5 text-[13px]";

  return (
    <div>
      <div className="rounded-2xl bg-ink p-6 text-canvas">
        <div className="eyebrow !text-canvas/60">Win balance</div>
        <div className="font-display mt-1 text-5xl tnum">{formatUsd(usdNum(win.usd1e18))}</div>
        <p className="mt-2 text-[12.5px] text-canvas/70">
          A win balance is claimed as reward assets from the vault, at the oracle price posted at claim time. It is not withdrawable as ETH: to take ETH out, redeem chips under Withdraw instead.
        </p>
      </div>

      {paused && <p role="alert" className="mt-4 text-[12.5px] text-casino-red">Conversions and claims are paused by the operator. Your chips and win balance are unchanged.</p>}
      {!collect.vaultLinked && <p role="alert" className="mt-4 text-[12.5px] text-casino-red">The treasury has no reward vault configured yet, so chips cannot be converted.</p>}

      {/* ------------------------------------------------------------ step 1 */}
      <section aria-labelledby="collect-convert" className="mt-8">
        <h2 id="collect-convert" className="eyebrow mb-3">1 · Convert chips to a win balance</h2>
        <label className="sr-only" htmlFor="convert-chips">Chips to convert</label>
        <div className="flex gap-2">
          <input
            id="convert-chips"
            type="number"
            inputMode="numeric"
            min={1}
            max={chips.units}
            value={convertUnits}
            disabled={blocked || chips.units === 0}
            onChange={(e) => setConvertInput(Math.max(0, Math.min(chips.units, Math.floor(Number(e.target.value) || 0))))}
            className={field}
          />
          <button type="button" disabled={blocked || chips.units === 0} onClick={() => setConvertInput(null)} className="h-12 shrink-0 rounded-xl border border-border px-4 text-[13px] hover:border-ink disabled:opacity-50">
            All
          </button>
        </div>
        <dl className="mt-4 divide-y divide-hairline">
          {line("Burn", `${formatNumber(convertUnits)} chips`)}
          {line("Win balance credit", chipUsd ? `${formatUsd(usdNum(creditUsd1e18))} · ${formatUsd(chipUsd)} per chip` : "—")}
          {line("Chips in your wallet", formatNumber(chips.units))}
          {line("Chips at a table", formatNumber(escrowUnits))}
        </dl>
        <p className="mt-3 min-h-[36px] text-[12.5px] text-muted">
          {chips.units === 0
            ? escrowUnits > 0
              ? `${formatNumber(escrowUnits)} chips are at a table. Leave the table to bring them back to your wallet first; only wallet chips can be converted.`
              : "No chips in your wallet. Chips you win at a table return to your wallet when you leave it."
            : convertUnits >= 1 && !selection.exact
              ? `Your chip denominations cannot make exactly ${formatNumber(convertUnits)}. The nearest amount at or below it is ${formatNumber(selection.units)}.`
              : escrowUnits > 0
                ? `${formatNumber(escrowUnits)} more chips are at a table. Leave the table first to convert those too.`
                : "Only chips in your wallet can be converted."}
        </p>
        <p className="mt-2 rounded-xl border border-hairline px-4 py-3 text-[12.5px] text-ink-2">
          <strong className="font-medium text-ink">One-way.</strong> Converted chips are burned and become a win balance. A win balance can only be claimed as reward assets below; it cannot be turned back into chips or withdrawn as ETH.
        </p>
        <Button size="lg" className="mt-4 w-full" disabled={!canConvert} onClick={openConvert}>
          Convert {convertUnits >= 1 ? `${formatNumber(convertUnits)} chips` : "chips"}
        </Button>
        {lastConvert && (
          <p className={receipt} role="status">
            <span>Converted {formatNumber(lastConvert.units)} chips to {formatUsd(lastConvert.usd)} of win balance.</span>
            <a href={explorerTx(lastConvert.hash)} target="_blank" rel="noreferrer" className="text-muted underline underline-offset-2 hover:text-ink">View transaction ↗</a>
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------ step 2 */}
      <section aria-labelledby="collect-claim" className="mt-10">
        <h2 id="collect-claim" className="eyebrow mb-3">2 · Claim as</h2>
        {!collect.enabled ? (
          <p className="text-[13px] text-muted">The reward vault address is not configured for this build.</p>
        ) : !collect.isFetched ? (
          <ul className="grid gap-2" aria-busy="true" aria-label="Reading the reward vault">
            {[0, 1, 2].map((i) => <li key={i}><Skeleton className="h-[92px] rounded-xl" /></li>)}
          </ul>
        ) : collect.readFailed ? (
          <p role="alert" className="text-[13px] text-muted">The reward vault could not be read just now. Nothing is shown in its place; this retries every few seconds.</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted">No reward assets are registered on the vault yet.</p>
        ) : (
          <ul className="grid gap-2" role="radiogroup" aria-label="Choose the asset to claim">
            {rows.map(({ asset, row }) => (
              <li key={asset.id}>
                <AssetOption asset={asset} line={row.line} claimable={row.claimable} selected={picked?.asset.id === asset.id} disabled={blocked || paused} now={now} onSelect={() => { setAssetId(asset.id); setAmountInput(""); }} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12.5px] text-muted">
          Claims are paid from the vault&apos;s own on-chain inventory, so the amount shown per asset is the most it can pay right now. A win balance above that stays yours and waits for the next restock.
        </p>

        {picked && amount && (
          <div className="mt-6">
            <label className="eyebrow mb-2 block" htmlFor="claim-usd">Amount to claim (USD)</label>
            <div className="flex gap-2">
              <input id="claim-usd" type="text" inputMode="decimal" autoComplete="off" placeholder={usdFloor(picked.row.limit.maxUsd1e18).slice(1)} value={amountInput} disabled={blocked} onChange={(e) => setAmountInput(e.target.value)} className={field} aria-describedby="claim-usd-hint" />
              <button type="button" disabled={blocked} onClick={() => setAmountInput("")} className="h-12 shrink-0 rounded-xl border border-border px-4 text-[13px] hover:border-ink disabled:opacity-50">
                Max
              </button>
            </div>
            <p id="claim-usd-hint" className={cn("mt-2 min-h-[18px] text-[12.5px]", amount.error ? "text-casino-red" : "text-muted")}>
              {amount.error ?? `Maximum right now ${usdFloor(picked.row.limit.maxUsd1e18)} · minimum ${formatUsd(usdNum(picked.asset.minimumPayoutUsd1e18))}`}
            </p>
            <dl className="mt-3 divide-y divide-hairline">
              {line("Asset", picked.asset.symbol)}
              {line("Amount", usdFloor(amount.usd1e18))}
              {line("Oracle price", picked.asset.priceUsd1e18 ? formatUsd(usdNum(picked.asset.priceUsd1e18), { maximumFractionDigits: 6 }) : "—")}
              {line("You receive (est.)", estimate != null ? `${tokenLabel(estimate, picked.asset.decimals)} ${picked.asset.symbol}` : "—")}
              {line("Slippage tolerance", `${CLAIM_SLIPPAGE_BPS / 100}%`)}
            </dl>
          </div>
        )}
        <Button variant="accent" size="lg" className="mt-6 w-full" disabled={!canClaim} onClick={openClaim}>
          {picked && amount && !amount.error ? `Claim ${usdFloor(amount.usd1e18)} as ${picked.asset.symbol}` : "Claim"}
        </Button>
        {lastClaim && (
          <p className={receipt} role="status">
            <span>
              {lastClaim.tokens != null ? `Received ${lastClaim.tokens} ${lastClaim.symbol}` : `Claimed ${lastClaim.symbol}`} for {formatUsd(lastClaim.usd)} of win balance.
            </span>
            <a href={explorerTx(lastClaim.hash)} target="_blank" rel="noreferrer" className="text-muted underline underline-offset-2 hover:text-ink">View transaction ↗</a>
          </p>
        )}
      </section>
    </div>
  );
}

function AssetOption({ asset, line, claimable, selected, disabled, now, onSelect }: { asset: CollectAsset; line: string; claimable: boolean; selected: boolean; disabled: boolean; now: number | null; onSelect: () => void }) {
  const price = asset.priceUsd1e18 ?? asset.postedPriceUsd1e18;
  const age = now != null && asset.priceUpdatedAt != null ? ageLabel(now - asset.priceUpdatedAt) : null;
  const stale = asset.priceUsd1e18 == null;
  const restocking = line === RESTOCK_NOTE;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled || !claimable}
      onClick={onSelect}
      className={cn("flex min-h-[92px] w-full items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed", selected ? "border-ink bg-sunken dark:bg-surface" : "border-border enabled:hover:border-border-strong", !claimable && "text-muted")}
    >
      <span className="flex min-w-0 items-start gap-3">
        <TokenLogo symbol={asset.symbol} logoURI={asset.logoURI} size={28} tone="accent" className={cn(!claimable && "opacity-50")} />
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-ink">{asset.symbol}</span>
          <span className="mt-0.5 block text-[12px] text-muted tnum">
            Vault holds {tokenLabel(asset.inventory, asset.decimals)} {asset.symbol}
            {price != null ? ` · ${stale ? "last price" : "price"} ${formatUsd(usdNum(price), { maximumFractionDigits: 6 })}` : " · no price posted"}
            {price != null && ` · ${age != null ? `${stale ? "stale, " : ""}updated ${age} ago` : "reading age…"}`}
          </span>
          <span className={cn("mt-1 block text-[12.5px]", claimable ? "text-ink" : restocking ? "text-ink-2" : "text-muted")}>{line}</span>
        </span>
      </span>
      <Badge tone={asset.status === "available" ? "accent" : asset.status === "low" ? "amber" : "outline"} className="shrink-0">{STATUS_LABEL[asset.status]}</Badge>
    </button>
  );
}
