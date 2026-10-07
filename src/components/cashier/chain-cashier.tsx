"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatEther, type Hex } from "viem";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { WalletButton } from "@/components/layout/wallet-button";
import { TransactionModal } from "./transaction-modal";
import { CollectPanel } from "./collect-panel";
import { DepositSplitPanel } from "./deposit-split-panel";
import { depositBreakdown } from "./deposit-split";
import { useWallet } from "@/store/wallet";
import { chipDenominations } from "@/config/tokens";
import { explorerTx, explorerAddress } from "@/config/chains";
import { cn, formatUsd, formatNumber, shortAddress, relativeTime } from "@/lib/utils";
import { track, bucketAmount } from "@/lib/analytics/events";
import { useChipBalances, useEscrow, useTreasurySnapshot, useWinBalance, useWithdrawable } from "@/lib/web3/hooks";
import { deposit, redeemAndWithdraw, withdraw } from "@/lib/web3/actions";
import { useTxFlow } from "@/lib/web3/use-tx-flow";
import { PAUSE_FLAGS, contractAddresses } from "@/lib/web3/contracts";

/**
 * Cashier against the live contracts (demo mode off). Deposits mint chips for the
 * payout-liquidity share of the ETH sent; redemptions are pull payments (redeem →
 * withdraw); the Claim tab is the two-step collect flow in ./collect-panel.tsx (convert chips to a
 * win balance, then claim it as a vault asset at the oracle price).
 */
const TABS = ["deposit", "chips", "claim", "withdraw"] as const;
type Tab = (typeof TABS)[number];

const fmtEth = (wei: bigint, digits = 6) => `${Number(formatEther(wei)).toFixed(digits).replace(/\.?0+$/, "")} ETH`;

/** Smallest msg.value that mints at least `chips` units given the split and chip price. */
export function depositValueFor(chips: number, chipPriceWei: bigint, liquidityBps: number): bigint {
  if (chips <= 0 || chipPriceWei <= 0n || liquidityBps <= 0) return 0n;
  const liq = BigInt(liquidityBps);
  let value = (BigInt(chips) * chipPriceWei * 10_000n + liq - 1n) / liq;
  const units = (v: bigint) => (v * liq) / 10_000n / chipPriceWei;
  for (let i = 0; i < 8 && units(value) < BigInt(chips); i++) value += 1n;
  return value;
}

export function ChainCashier() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const [localTab, setTab] = useState<Tab | null>(null);
  const tab: Tab = localTab ?? (tabParam && TABS.includes(tabParam) ? tabParam : "deposit");
  const wallet = useWallet();
  const address = wallet.address;

  const chips = useChipBalances(address);
  const escrow = useEscrow(address);
  const treasury = useTreasurySnapshot();
  const pending = useWithdrawable(address);
  const win = useWinBalance(address);
  const flow = useTxFlow();
  const [recent, setRecent] = useState<Array<{ hash: Hex; label: string; at: number }>>([]);
  const recordTx = useCallback((label: string, hash: Hex) => setRecent((r) => [{ hash, label, at: Date.now() }, ...r].slice(0, 8)), []);
  const record = (label: string) => (hash: Hex) => recordTx(label, hash);

  const wrongNetwork = wallet.status === "wrong-network";
  const connected = wallet.status === "connected";
  const configured = !!contractAddresses.treasury && !!contractAddresses.chip;
  const pausedDeposits = (treasury.pauseFlags & PAUSE_FLAGS.deposits) !== 0;
  const pausedWithdrawals = (treasury.pauseFlags & PAUSE_FLAGS.withdrawals) !== 0;
  const blocked = wrongNetwork || !configured || flow.busy;

  // deposit
  const [chipsIn, setChipsIn] = useState(100);
  const liquidityBps = treasury.split?.payoutLiquidityBps ?? 0;
  const depositWei = useMemo(() => depositValueFor(chipsIn, treasury.chipPriceWei, liquidityBps), [chipsIn, treasury.chipPriceWei, liquidityBps]);
  const chipUsd = Number(treasury.chipUsdValue) / 1e18;
  const breakdown = useMemo(() => (treasury.split ? depositBreakdown(depositWei, treasury.split, treasury.chipPriceWei) : null), [depositWei, treasury.split, treasury.chipPriceWei]);
  const [splitAck, setSplitAck] = useState(false);
  const onSplitAck = useCallback((v: boolean) => setSplitAck(v), []);

  // withdraw
  const [withdrawChips, setWithdrawChips] = useState(50);

  if (!connected && !wrongNetwork) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Eyebrow className="mb-4 block">Cashier</Eyebrow>
        <h1 className="font-display text-display-md">Connect to open the cashier.</h1>
        <p className="mt-4 max-w-md text-muted">Deposits mint chips to your wallet. Claims and withdrawals settle on Robinhood Chain.</p>
        <div className="mt-8"><WalletButton /></div>
      </div>
    );
  }

  const field = "h-12 w-full rounded-xl border border-border bg-surface px-4 text-[18px] tnum outline-none focus:border-ink dark:bg-elevated disabled:opacity-50";
  const row = (k: string, v: React.ReactNode) => <div className="flex items-center justify-between py-2.5 text-[13.5px]"><span className="text-muted">{k}</span><span className="tnum">{v}</span></div>;

  const openDeposit = () => {
    track("deposit_start", { amount: bucketAmount(chipsIn) });
    flow.open({
      title: "Deposit",
      summary: [
        ["Send", fmtEth(depositWei)],
        ["Receive", `${chipsIn} chips`],
        ["Cash-out value", breakdown ? `${fmtEth(breakdown.cashOutWei)} (${(breakdown.cashOutBps / 100).toFixed(0)}% of what you send)` : "—"],
        ["Not returned", breakdown ? `${fmtEth(breakdown.notReturnedWei)} · rewards, reserve, fee` : "—"],
        ["Network", "Robinhood Chain"],
        ["Wallet", shortAddress(address!)],
      ],
      run: (report) => deposit(depositWei, report),
      onSuccess: async (hash) => {
        record("Deposit")(hash);
        track("deposit_complete", { amount: bucketAmount(chipsIn) });
        await Promise.all([chips.refetch(), treasury.refetch()]);
      },
    });
  };

  const openRedeem = () => {
    const wei = BigInt(withdrawChips) * treasury.chipPriceWei;
    flow.open({
      title: "Withdraw",
      summary: [["Burn", `${withdrawChips} chips`], ["Receive", fmtEth(wei)], ["Method", "redeem, then withdraw (two signatures)"], ["Network", "Robinhood Chain"]],
      needsApproval: true,
      run: (report) => redeemAndWithdraw(chips.balances, withdrawChips, report),
      onSuccess: async (hash) => {
        record("Withdraw")(hash);
        await Promise.all([chips.refetch(), pending.refetch(), treasury.refetch()]);
      },
    });
  };

  const openWithdrawPending = () => {
    flow.open({
      title: "Withdraw",
      summary: [["Receive", fmtEth(pending.wei)], ["Method", "pull payment"], ["Network", "Robinhood Chain"]],
      run: (report) => withdraw(report),
      onSuccess: async (hash) => {
        record("Withdraw")(hash);
        await pending.refetch();
      },
    });
  };

  return (
    <div className="container-edge py-12 md:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow className="mb-3 block">Cashier</Eyebrow>
            <h1 className="font-display text-display-md">Chips in, assets out.</h1>
          </div>
          <Badge tone="accent">Robinhood Chain</Badge>
        </div>

        {wrongNetwork && (
          <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-casino-red/40 bg-surface px-4 py-3 text-[13.5px] dark:bg-elevated">
            <span>Your wallet is on another network. Switch to Robinhood Chain to deposit, claim or withdraw.</span>
            <WalletButton size="sm" />
          </div>
        )}
        {!configured && (
          <div role="alert" className="mt-6 rounded-xl border border-casino-red/40 bg-surface px-4 py-3 text-[13.5px] dark:bg-elevated">
            Contract addresses are not configured for this build (NEXT_PUBLIC_TREASURY_ADDRESS / NEXT_PUBLIC_CHIP1155_ADDRESS).
          </div>
        )}

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
                <label className="eyebrow mb-2 block" htmlFor="chips-in">Chips to buy</label>
                <input id="chips-in" type="number" min={1} value={chipsIn} disabled={blocked} onChange={(e) => setChipsIn(Math.max(0, Math.floor(Number(e.target.value))))} className={field} />
                <div className="mt-2 flex gap-2">{[50, 100, 250, 500].map((v) => <button key={v} type="button" disabled={blocked} onClick={() => setChipsIn(v)} className="h-8 rounded-full border border-border px-3 text-[12px] hover:border-ink disabled:opacity-50">{v}</button>)}</div>
                <dl className="mt-6 divide-y divide-hairline">
                  {row("Send", treasury.chipPriceWei > 0n ? fmtEth(depositWei) : <span className="text-muted">reading chip price…</span>)}
                  {row("Receive", <span className="flex items-center gap-2"><Chip value={1} size={20} />{chipsIn} chips</span>)}
                  {row("Cash-out value", breakdown ? fmtEth(breakdown.cashOutWei) : "—")}
                  {row("Reward value", chipUsd ? `${formatUsd(chipUsd)} per chip if converted to a win balance` : "—")}
                  {row("Network", "Robinhood Chain")}
                  {row("Wallet", address ? shortAddress(address) : "—")}
                </dl>
                <DepositSplitPanel breakdown={breakdown} split={treasury.split} chips={chipsIn} onAckChange={onSplitAck} />
                {pausedDeposits && <p className="mt-4 text-[12.5px] text-casino-red">Deposits are paused by the operator.</p>}
                <Button variant="accent" size="lg" className="mt-6 w-full" disabled={blocked || pausedDeposits || chipsIn < 1 || depositWei === 0n || !splitAck} onClick={openDeposit}>
                  Deposit {treasury.chipPriceWei > 0n ? fmtEth(depositWei) : ""}
                </Button>
                {!splitAck && breakdown && <p className="mt-2 text-center text-[12px] text-muted">Tick the box above to confirm you have read the split.</p>}
              </div>
            )}
            {tab === "chips" && (
              <div>
                <div className="flex items-end justify-between"><h2 className="eyebrow">Your chips</h2><span className="font-display text-3xl tnum">{formatNumber(chips.units)}</span></div>
                <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {chipDenominations.map((d) => {
                    const n = Number(chips.balances[d]);
                    return (
                      <li key={d} className={cn("flex flex-col items-center gap-2 rounded-xl border border-border p-3", n === 0 && "opacity-40")}>
                        <Chip value={d} size={40} /><span className="text-[12px] tnum">× {n}</span>
                      </li>
                    );
                  })}
                </ul>
                <dl className="mt-6 divide-y divide-hairline">
                  {row("In wallet", `${formatNumber(chips.units)} chips`)}
                  {row("At the table (escrow)", `${formatNumber(escrow.units)} chips`)}
                  {row("Pending withdrawal", fmtEth(pending.wei))}
                  {row("Win balance", formatUsd(win.usd))}
                </dl>
                <p className="mt-4 text-[12.5px] text-muted">
                  Chips are ERC-1155 tokens (ids 1001–1100) in your wallet{contractAddresses.chip && <> · <a href={explorerAddress(contractAddresses.chip)} target="_blank" rel="noreferrer" className="underline underline-offset-2">contract ↗</a></>}. Entering a table escrows them; leaving mints them back.
                </p>
                <div className="mt-6 flex gap-3"><Button href="/play/quick">Play</Button><Button href="/tables" variant="outline">Find a table</Button></div>
              </div>
            )}
            {tab === "claim" && address && (
              <CollectPanel
                address={address}
                chips={chips}
                escrowUnits={escrow.units}
                win={win}
                chipUsdValue={treasury.chipUsdValue}
                blocked={blocked}
                treasuryPauseFlags={treasury.pauseFlags}
                open={flow.open}
                record={recordTx}
                refetchTreasury={treasury.refetch}
              />
            )}
            {tab === "withdraw" && (
              <div>
                <label className="eyebrow mb-2 block" htmlFor="wd">Chips to redeem</label>
                <input id="wd" type="number" min={1} max={chips.units} value={withdrawChips} disabled={blocked} onChange={(e) => setWithdrawChips(Math.max(0, Math.min(chips.units, Math.floor(Number(e.target.value)))))} className={field} />
                <dl className="mt-6 divide-y divide-hairline">
                  {row("Burn", `${withdrawChips} chips`)}
                  {row("Receive", fmtEth(BigInt(withdrawChips) * treasury.chipPriceWei))}
                  {row("Method", "redeem → withdraw (pull payment)")}
                </dl>
                {escrow.units > 0 && <p className="mt-3 text-[12.5px] text-muted">{formatNumber(escrow.units)} chips are at a table. Leave the table to bring them back to your wallet first.</p>}
                {pausedWithdrawals && <p className="mt-4 text-[12.5px] text-casino-red">Withdrawals are paused by the operator.</p>}
                <Button size="lg" className="mt-6 w-full" disabled={blocked || pausedWithdrawals || withdrawChips < 1 || withdrawChips > chips.units} onClick={openRedeem}>
                  Redeem chips
                </Button>
                {pending.wei > 0n && (
                  <Button size="lg" variant="outline" className="mt-3 w-full" disabled={blocked || pausedWithdrawals} onClick={openWithdrawPending}>
                    Withdraw pending {fmtEth(pending.wei)}
                  </Button>
                )}
              </div>
            )}
          </div>

          <aside className="text-[13px]">
            <h2 className="eyebrow mb-3">Recent transactions</h2>
            {recent.length === 0 ? <p className="text-muted">None yet this session.</p> : (
              <ul className="space-y-2">
                {recent.map((d) => (
                  <li key={d.hash} className="flex items-center justify-between gap-2">
                    <span>{d.label}</span>
                    <a href={explorerTx(d.hash)} target="_blank" rel="noreferrer" className="text-muted underline-offset-2 hover:underline">{relativeTime(d.at)} ↗</a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 border-t border-hairline pt-4 text-[12px] text-muted">
              <Badge tone="outline" className="mb-2">{treasury.isFetched ? (treasury.isSolvent ? "Treasury solvent" : "Treasury check failed") : "Reading treasury"}</Badge>
              <p>Available bankroll {treasury.isFetched ? fmtEth(treasury.availableBankrollWei, 4) : "—"}. Contracts are not yet audited.</p>
            </div>
          </aside>
        </div>
      </div>

      <TransactionModal {...flow.modalProps} />
    </div>
  );
}
