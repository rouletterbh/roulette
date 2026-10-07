"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { formatEther } from "viem";
import { cn } from "@/lib/utils";
import type { DepositBreakdown, DepositSplitBps } from "./deposit-split";
import { splitAckKey } from "./deposit-split";

const eth = (wei: bigint, digits = 6) => `${Number(formatEther(wei)).toFixed(digits).replace(/\.?0+$/, "")} ETH`;
function readAck(key: string | null): boolean {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/**
 * Always-visible deposit breakdown: what the chips cash out for, and what is never returned.
 * Shown before the Deposit button and acknowledged once per split (remembered in this browser).
 */
export function DepositSplitPanel({
  breakdown,
  split,
  chips,
  ethUsd,
  onAckChange,
}: {
  breakdown: DepositBreakdown | null;
  split: DepositSplitBps | null;
  chips: number;
  ethUsd?: number | null;
  onAckChange: (ack: boolean) => void;
}) {
  const id = useId();
  const key = split ? splitAckKey(split) : null;
  // Remembered acknowledgement (per split, this browser), read without setState-in-effect.
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => readAck(key),
    () => false,
  );
  const [override, setOverride] = useState<{ key: string; value: boolean } | null>(null);
  const ack = override && override.key === key ? override.value : stored;
  useEffect(() => {
    onAckChange(ack);
  }, [ack, onAckChange]);
  const toggle = (v: boolean) => {
    if (!key) return;
    setOverride({ key, value: v });
    try {
      if (v) window.localStorage.setItem(key, "1");
      else window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable: the choice still holds for this page */
    }
  };

  if (!breakdown || !split) {
    return <div className="mt-6 h-[268px] animate-pulse rounded-2xl border border-border bg-surface dark:bg-elevated" aria-busy="true" />;
  }
  const b = breakdown;
  const usd = (wei: bigint) => (ethUsd ? ` ≈ $${(Number(formatEther(wei)) * ethUsd).toFixed(2)}` : "");
  const parts: Array<{ label: string; detail: string; wei: bigint; bps: number; tone: string }> = [
    { label: "Backs your chips", detail: "returned when you cash out", wei: b.cashOutWei, bps: split.payoutLiquidityBps, tone: "bg-ink" },
    { label: "Reward inventory", detail: "buys RBL and other reward tokens for the vault", wei: b.inventoryWei, bps: split.rewardInventoryBps, tone: "bg-[var(--accent)]" },
    { label: "Protocol reserve", detail: "held back, never used for payouts", wei: b.reserveWei, bps: split.protocolReserveBps, tone: "bg-muted" },
    { label: "Platform fee", detail: "kept by the platform", wei: b.feeWei + (b.liquidityWei - b.cashOutWei), bps: split.platformFeeBps, tone: "bg-faint" },
  ];
  const keepPct = pct(split.payoutLiquidityBps);
  const lossPct = pct(10_000 - split.payoutLiquidityBps);

  return (
    <section aria-labelledby={`${id}-h`} className="mt-6 rounded-2xl border border-ink/20 bg-surface p-5 dark:bg-elevated">
      <h3 id={`${id}-h`} className="font-display text-[22px] leading-tight">
        You get {keepPct} back if you cash out.
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
        These {chips} chips cash out for <strong className="tnum">{eth(b.cashOutWei)}</strong>
        {usd(b.cashOutWei)}. The other <strong className="tnum">{eth(b.notReturnedWei)}</strong>
        {usd(b.notReturnedWei)} ({lossPct}) is split below and is <strong>not returned</strong>, win or lose.
      </p>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full" role="img" aria-label={`Deposit split: ${parts.map((p) => `${p.label} ${pct(p.bps)}`).join(", ")}`}>
        {parts.map((p) => (
          <span key={p.label} className={cn("h-full", p.tone)} style={{ width: `${p.bps / 100}%` }} />
        ))}
      </div>

      <dl className="mt-3 divide-y divide-hairline">
        {parts.map((p) => (
          <div key={p.label} className="flex items-start justify-between gap-4 py-2 text-[13px]">
            <dt className="flex items-start gap-2">
              <span className={cn("mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full", p.tone)} aria-hidden />
              <span>
                <span className="text-ink">{p.label}</span> <span className="text-muted">· {pct(p.bps)} · {p.detail}</span>
              </span>
            </dt>
            <dd className="tnum shrink-0 text-ink">{eth(p.wei)}</dd>
          </div>
        ))}
      </dl>

      <label htmlFor={`${id}-ack`} className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 text-[13px] leading-relaxed">
        <input id={`${id}-ack`} type="checkbox" checked={ack} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ink)]" />
        <span>
          I understand that chips cash out for {keepPct} of what I send, and that the other {lossPct} funds rewards, the reserve and the platform fee and is not
          returned.
        </span>
      </label>
    </section>
  );
}
