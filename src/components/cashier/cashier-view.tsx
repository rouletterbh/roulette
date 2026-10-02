"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { WalletButton } from "@/components/layout/wallet-button";
import { TransactionModal, simulateTx, type TxStep } from "./transaction-modal";
import { RewardSelector } from "@/components/rewards/reward-selector";
import { useWallet } from "@/store/wallet";
import { useChips } from "@/store/chips";
import { getRewardInventory } from "@/lib/demo/rewards";
import { splitDeposit } from "@/lib/risk/engine";
import { chipDenominations } from "@/config/tokens";
import { explorerTx } from "@/config/chains";
import { cn, formatUsd, formatNumber, shortAddress, relativeTime } from "@/lib/utils";
import { track, bucketAmount } from "@/lib/analytics/events";

const TABS = ["deposit", "chips", "claim", "withdraw"] as const;
type Tab = (typeof TABS)[number];
const CHIP_PRICE_USD = 1;

export function CashierView() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const [localTab, setTab] = useState<Tab | null>(null);
  const tab: Tab = localTab ?? (tabParam && TABS.includes(tabParam) ? tabParam : "deposit");
  const wallet = useWallet();
  const chips = useChips();

  // transaction state
  const [modal, setModal] = useState<null | { title: string; summary: Array<[string, React.ReactNode]>; approval?: boolean; onDone: (hash: string) => void }>(null);
  const [step, setStep] = useState<TxStep>("review");
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (m: NonNullable<typeof modal>) => {
    setModal(m); setStep("review"); setHash(null); setError(null);
    if (m.title === "Deposit") track("deposit_start", { amount: bucketAmount(amount) });
    if (m.title === "Claim") track("claim_start", { amount: bucketAmount(claimAmount) });
  };
  const confirm = async () => {
    if (!modal) return;
    try {
      const h = await simulateTx(setStep, { approval: modal.approval });
      setHash(h);
      modal.onDone(h);
      if (modal.title === "Deposit") track("deposit_complete", { amount: bucketAmount(amount) });
      if (modal.title === "Claim") track("claim_complete", { amount: bucketAmount(claimAmount) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  // deposit
  const [amount, setAmount] = useState(25);
  const chipsOut = Math.floor(amount / CHIP_PRICE_USD);
  const split = splitDeposit(amount);

  // chips breakdown (greedy by denomination)
  const breakdown = useMemo(() => {
    const out: Array<{ d: number; n: number }> = [];
    const total = Math.floor(chips.balance);
    const desc = [...chipDenominations].reverse();
    desc.reduce((rest, d) => {
      const n = Math.floor(rest / d);
      out.unshift({ d, n });
      return rest - n * d;
    }, total);
    return out;
  }, [chips.balance]);

  // claim
  const inventory = getRewardInventory();
  const [asset, setAsset] = useState<string | null>(null);
  const claimAmount = chips.winBalanceUsd;
  const chosen = inventory.find((i) => i.token.id === asset);

  // withdraw
  const [withdrawChips, setWithdrawChips] = useState(50);

  if (wallet.status !== "connected") {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Eyebrow className="mb-4 block">Cashier</Eyebrow>
        <h1 className="font-display text-display-md">Connect to open the cashier.</h1>
        <p className="mt-4 max-w-md text-muted">Deposits mint chips to your wallet. Claims and withdrawals settle on Robinhood Chain.</p>
        <div className="mt-8"><WalletButton /></div>
      </div>
    );
  }

  const field = "h-12 w-full rounded-xl border border-border bg-surface px-4 text-[18px] tnum outline-none focus:border-ink dark:bg-elevated";
  const row = (k: string, v: React.ReactNode) => <div className="flex items-center justify-between py-2.5 text-[13.5px]"><span className="text-muted">{k}</span><span className="tnum">{v}</span></div>;

  return (
    <div className="container-edge py-12 md:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow className="mb-3 block">Cashier</Eyebrow>
            <h1 className="font-display text-display-md">Chips in, assets out.</h1>
          </div>
          <DemoBadge />
        </div>

        <div className="mt-8 flex gap-1 border-b border-hairline" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); router.replace(`/cashier?tab=${t}`); }} className={cn("relative px-4 py-3 text-[13.5px] font-medium capitalize transition-colors", tab === t ? "text-ink" : "text-muted hover:text-ink")}>
              {t}
              {tab === t && <span className="absolute inset-x-4 -bottom-px h-px bg-ink" />}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[1fr_280px]">
          <div role="tabpanel">
            {tab === "deposit" && (
              <div>
                <label className="eyebrow mb-2 block" htmlFor="amount">Amount (USD)</label>
                <input id="amount" type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} className={field} />
                <div className="mt-2 flex gap-2">{[10, 25, 50, 100].map((v) => <button key={v} type="button" onClick={() => setAmount(v)} className="h-8 rounded-full border border-border px-3 text-[12px] hover:border-ink">${v}</button>)}</div>
                <dl className="mt-6 divide-y divide-hairline">
                  {row("Receive", <span className="flex items-center gap-2"><Chip value={1} size={20} />{chipsOut} chips</span>)}
                  {row("Network", "Robinhood Chain")}
                  {row("Wallet", shortAddress(wallet.address!))}
                  {row("Price per chip", formatUsd(CHIP_PRICE_USD))}
                </dl>
                <details className="mt-4 text-[12.5px] text-muted"><summary className="cursor-pointer">How your deposit is allocated</summary>
                  <dl className="mt-2 divide-y divide-hairline">{row("Payout liquidity", formatUsd(split.liquidity))}{row("Reward inventory", formatUsd(split.inventory))}{row("Protocol reserve", formatUsd(split.reserve))}{row("Platform fee", formatUsd(split.fee))}</dl>
                </details>
                <Button variant="accent" size="lg" className="mt-6 w-full" disabled={chipsOut < 1} onClick={() => open({ title: "Deposit", summary: [["Amount", formatUsd(amount)], ["Receive", `${chipsOut} chips`], ["Network", "Robinhood Chain"], ["Wallet", shortAddress(wallet.address!)]], onDone: (h) => chips.recordDeposit(amount, chipsOut, h) })}>
                  Deposit
                </Button>
              </div>
            )}
            {tab === "chips" && (
              <div>
                <div className="flex items-end justify-between"><h2 className="eyebrow">Your chips</h2><span className="font-display text-3xl tnum">{formatNumber(chips.balance)}</span></div>
                <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {breakdown.map(({ d, n }) => (
                    <li key={d} className={cn("flex flex-col items-center gap-2 rounded-xl border border-border p-3", n === 0 && "opacity-40")}>
                      <Chip value={d} size={40} /><span className="text-[12px] tnum">× {n}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12.5px] text-muted">Chips are ERC-1155 tokens (ids 1001–1100) in your wallet. Entering a table escrows them; leaving reconciles. Breakdown shown is by value; onchain denominations may differ.</p>
                <div className="mt-6 flex gap-3"><Button href="/play/quick">Play</Button><Button href="/tables" variant="outline">Find a table</Button></div>
              </div>
            )}
            {tab === "claim" && (
              <div>
                <div className="rounded-2xl bg-ink p-6 text-canvas">
                  <div className="eyebrow !text-canvas/60">You won.</div>
                  <div className="font-display mt-1 text-5xl tnum">{formatUsd(claimAmount)}</div>
                  <p className="mt-2 text-[12.5px] text-canvas/70">Win balance. Choose how it settles. Quotes are indicative until settlement; token amounts are never promised in advance.</p>
                </div>
                <h2 className="eyebrow mb-3 mt-8">Claim as</h2>
                <RewardSelector items={inventory} amountUsd={claimAmount} value={asset} onChange={setAsset} />
                {chosen && (
                  <dl className="mt-6 divide-y divide-hairline">
                    {row("Asset", chosen.token.symbol)}
                    {row("Amount", formatUsd(claimAmount))}
                    {row("Conversion quote", chosen.priceUsd ? `${formatNumber(claimAmount / chosen.priceUsd)} ${chosen.token.symbol}` : <span className="text-muted">oracle not set · settled at claim</span>)}
                    {row("Slippage tolerance", "0.5%")}
                  </dl>
                )}
                <Button variant="accent" size="lg" className="mt-6 w-full" disabled={!chosen || claimAmount <= 0} onClick={() => chosen && open({ title: "Claim", summary: [["Amount", formatUsd(claimAmount)], ["Asset", chosen.token.symbol], ["Network", "Robinhood Chain"]], onDone: () => { chips.claim(claimAmount); setAsset(null); } })}>
                  Claim
                </Button>
              </div>
            )}
            {tab === "withdraw" && (
              <div>
                <label className="eyebrow mb-2 block" htmlFor="wd">Chips to redeem</label>
                <input id="wd" type="number" min={1} max={chips.balance} value={withdrawChips} onChange={(e) => setWithdrawChips(Math.max(0, Math.min(chips.balance, Number(e.target.value))))} className={field} />
                <dl className="mt-6 divide-y divide-hairline">
                  {row("Burn", `${withdrawChips} chips`)}
                  {row("Receive", `${formatUsd(withdrawChips * CHIP_PRICE_USD)} in ETH`)}
                  {row("Method", "pull payment · withdraw after redeem")}
                </dl>
                <Button size="lg" className="mt-6 w-full" disabled={withdrawChips < 1 || withdrawChips > chips.balance} onClick={() => open({ title: "Withdraw", summary: [["Burn", `${withdrawChips} chips`], ["Receive", `${formatUsd(withdrawChips)} ETH-equivalent`], ["Network", "Robinhood Chain"]], onDone: () => chips.debit(withdrawChips) })}>
                  Redeem chips
                </Button>
              </div>
            )}
          </div>

          <aside className="text-[13px]">
            <h2 className="eyebrow mb-3">Recent transactions</h2>
            {chips.deposits.length === 0 ? <p className="text-muted">None yet this session.</p> : (
              <ul className="space-y-2">
                {chips.deposits.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span>Deposit <span className="tnum">{formatUsd(d.amountUsd)}</span></span>
                    <a href={explorerTx(d.hash)} target="_blank" rel="noreferrer" className="text-muted underline-offset-2 hover:underline">{relativeTime(d.at)} ↗</a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 border-t border-hairline pt-4 text-[12px] text-muted">
              <Badge tone="outline" className="mb-2">Testnet</Badge>
              <p>Explorer links resolve once contracts are deployed on Robinhood Chain.</p>
            </div>
          </aside>
        </div>
      </div>

      <TransactionModal open={!!modal} step={step} title={modal?.title ?? ""} summary={modal?.summary ?? []} hash={hash} error={error} needsApproval={modal?.approval} gasEstimate="≈ 0.00004 ETH" onClose={() => setModal(null)} onConfirm={confirm} />
    </div>
  );
}
