"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Address } from "viem";
import { siteConfig } from "@/config/site";
import { useAgentSeats, validateRules, AGENT_CAPS } from "@/store/agent-seat";
import { useWallet } from "@/store/wallet";
import { useChips } from "@/store/chips";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useChipBalances, useEscrow } from "@/lib/web3/hooks";
import { selectChips, type ChipBalances } from "@/lib/web3/contracts";
import { leaveTable } from "@/lib/web3/actions";
import { useTxFlow } from "@/lib/web3/use-tx-flow";
import { AGENT_GAS_FLOAT_WEI, formatEth } from "@/lib/agent-wallet/gas";
import { tableLabel } from "@/lib/agent/options";
import {
  QUICK_EDGE_LINE,
  QUICK_STYLES,
  denominationNote,
  quickAgentCode,
  quickRules,
  quickStyle,
  quickSummary,
  unitBudgetOptions,
  walletBudgetPlan,
  winChanceLabel,
  type BudgetPlan,
  type QuickStyleId,
} from "@/lib/agent/quick-start";
import { TransactionModal } from "@/components/cashier/transaction-modal";
import { WalletButton } from "@/components/layout/wallet-button";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";
import { useAgentOptions } from "./agent-options";
import { ApprovalTerms } from "./agent-seat-panel";
import { useAgentFunding, useAgentGasPrice } from "./chain-agent";

/**
 * Agent quick start (default at /agents/new): 1 · pick a style, 2 · pick a budget,
 * 3 · start. Every other setting is derived (src/lib/agent/quick-start.ts). The full
 * builder stays one link away ("Customise rules").
 *
 * Modes:
 *   chain      demo mode off, real table: budget from the wallet's chips (exact
 *              denominations), Start runs the existing approve + funding path.
 *   practice   ?table=practice: practice balance, no funding, approved at once.
 *   simulated  demo mode on: the simulated chip balance, approved at once.
 */
export const PRACTICE_BALANCE = 1000;
const NO_COLLECTION = { primaryAssetId: null, fallbackAssetId: null };

type Mode = "chain" | "practice" | "simulated";

export function builderHref(mode: "quick" | "advanced", table: string | null) {
  const q = new URLSearchParams();
  if (mode === "advanced") q.set("mode", "advanced");
  else q.set("mode", "quick");
  if (table) q.set("table", table);
  return `/agents/new?${q.toString()}`;
}

export function tableHrefFor(tableId: string) {
  return tableId === "practice" ? "/play/practice" : tableId === "quick" ? "/play/quick" : `/table/${tableId}`;
}

export function AgentQuickStart() {
  const params = useSearchParams();
  const tableParam = params.get("table");
  const tableId = tableParam ?? "quick";
  const practice = tableId === "practice";
  const mounted = useMounted();
  const status = useWallet((s) => s.status);
  const address = useWallet((s) => s.address);

  if (!mounted) return <QuickShell tableParam={tableParam} busy />;
  if (practice) return <UnitQuickStart mode="practice" owner="practice" tableId={tableId} tableParam={tableParam} />;
  if (status !== "connected" || !address) {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Eyebrow className="mb-4 block">Start an agent</Eyebrow>
        <h1 className="font-display text-display-md">Connect your wallet to start an agent.</h1>
        <p className="mt-4 max-w-md text-muted">An agent plays your seat with chips you give it. Nothing runs until you press Start.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <WalletButton />
          <Button href={builderHref("quick", "practice")} variant="outline">Try it with practice chips</Button>
        </div>
      </div>
    );
  }
  if (siteConfig.demoMode) return <SimulatedQuickStart owner={address} tableId={tableId} tableParam={tableParam} />;
  return <ChainQuickStart owner={address} tableId={tableId} tableParam={tableParam} />;
}

function SimulatedQuickStart(props: { owner: string; tableId: string; tableParam: string | null }) {
  const balance = useChips((s) => s.balance);
  return <UnitQuickStart mode="simulated" balance={balance} {...props} />;
}

/** Practice / demo: a plain number balance, the 50% cap, no funding. */
function UnitQuickStart({ mode, owner, tableId, tableParam, balance = PRACTICE_BALANCE }: { mode: "practice" | "simulated"; owner: string; tableId: string; tableParam: string | null; balance?: number }) {
  const plan = useMemo<BudgetPlan>(() => {
    const options = unitBudgetOptions(balance, AGENT_CAPS.allowanceShareOfBalance);
    return options.length ? { kind: "options", total: balance, options } : { kind: "empty", options: [] };
  }, [balance]);
  return <QuickStartFlow mode={mode} owner={owner} tableId={tableId} tableParam={tableParam} plan={plan} walletTotal={balance} balances={null} />;
}

/** Demo mode off: the budget comes from the wallet's chips; chips at a table can be moved back first. */
function ChainQuickStart({ owner, tableId, tableParam }: { owner: string; tableId: string; tableParam: string | null }) {
  const chips = useChipBalances(owner as Address);
  const escrow = useEscrow(owner as Address);
  const flow = useTxFlow();
  const ready = chips.enabled && !chips.isLoading && (escrow.isFetched || !escrow.enabled);
  const plan = useMemo(() => (ready ? walletBudgetPlan(chips.balances, escrow.units) : null), [ready, chips.balances, escrow.units]);

  // Stable callback: the latest escrow figure and refetchers are read through a ref.
  const latest = useRef({ escrow: escrow.escrow, refetchEscrow: escrow.refetch, refetchChips: chips.refetch, open: flow.open });
  useEffect(() => {
    latest.current = { escrow: escrow.escrow, refetchEscrow: escrow.refetch, refetchChips: chips.refetch, open: flow.open };
  });
  const moveFromTable = useCallback(() => {
    const L = latest.current;
    const units = L.escrow;
    if (units === 0n) return;
    L.open({
      title: "Move chips to your wallet",
      summary: [
        ["Chips to wallet", formatNumber(Number(units))],
        ["Method", "leaveTable · mints escrow back as chips"],
        ["Note", "Bets already placed stay in their round; winnings return to the table"],
      ],
      run: (report) => leaveTable(units, report),
      onSuccess: async () => {
        await Promise.all([latest.current.refetchEscrow(), latest.current.refetchChips()]);
      },
    });
  }, []);

  return (
    <>
      <QuickStartFlow
        mode="chain"
        owner={owner}
        tableId={tableId}
        tableParam={tableParam}
        plan={plan}
        walletTotal={chips.units}
        balances={chips.balances}
        escrowUnits={escrow.units}
        onMoveFromTable={moveFromTable}
        moveBusy={flow.busy}
      />
      <TransactionModal {...flow.modalProps} />
    </>
  );
}

/* ------------------------------------------------------------------ layout */

function QuickShell({ tableParam, busy, children, aside }: { tableParam: string | null; busy?: boolean; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="container-edge py-10 md:py-14" aria-busy={busy || undefined}>
      <div className="flex flex-col gap-4 border-b border-ink pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow className="mb-2 block">Agent quick start</Eyebrow>
          <h1 className="font-display text-display-sm leading-none">Start an agent in three steps.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {aside}
          <Link href={builderHref("advanced", tableParam)} className="text-muted underline underline-offset-4 hover:text-ink">Customise rules</Link>
        </div>
      </div>
      {busy ? (
        <div className="mt-8 space-y-10">
          <Skeleton className="h-[148px] w-full" />
          <Skeleton className="h-[96px] w-full" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function StepHead({ n, title, id }: { n: number; title: string; id: string }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-ink pt-3">
      <span className="font-mono text-[11px] text-faint">0{n}</span>
      <h2 id={id} className="font-mono text-[12px] uppercase tracking-[0.14em]">{title}</h2>
    </div>
  );
}

/** Arrow keys move the selection inside a radiogroup; only the selected item (or the first) is tabbable. */
function useRovingRadio<T>(values: readonly T[], value: T | null, onChange: (v: T) => void) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = useCallback(
    (i: number, e: React.KeyboardEvent) => {
      const n = values.length;
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % n;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + n) % n;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = n - 1;
      if (j < 0) return;
      e.preventDefault();
      onChange(values[j]);
      refs.current[j]?.focus();
    },
    [values, onChange],
  );
  const selectedIndex = value == null ? -1 : values.indexOf(value);
  const tabIndex = (i: number) => (selectedIndex < 0 ? (i === 0 ? 0 : -1) : i === selectedIndex ? 0 : -1);
  return { refs, onKeyDown, tabIndex };
}

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
const STYLE_IDS = QUICK_STYLES.map((s) => s.id);

/* -------------------------------------------------------------------- flow */

interface FlowProps {
  mode: Mode;
  owner: string;
  tableId: string;
  tableParam: string | null;
  /** null while the wallet is read. */
  plan: BudgetPlan | null;
  walletTotal: number;
  balances: ChipBalances | null;
  escrowUnits?: number;
  onMoveFromTable?: () => void;
  moveBusy?: boolean;
}

function QuickStartFlow({ mode, owner, tableId, tableParam, plan, walletTotal, balances, escrowUnits = 0, onMoveFromTable, moveBusy }: FlowProps) {
  const router = useRouter();
  const create = useAgentSeats((s) => s.create);
  const approve = useAgentSeats((s) => s.approve);
  const options = useAgentOptions();
  const funding = useAgentFunding();
  const gasPrice = useAgentGasPrice();
  const onChain = mode === "chain";

  const [styleId, setStyleId] = useState<QuickStyleId | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const style = quickStyle(styleId);
  // A pick that the current balances can no longer make is simply not selected (no effect needed).
  const budget = picked != null && plan?.options.some((o) => o.units === picked) ? picked : null;
  const budgetValues = useMemo(() => plan?.options.map((o) => o.units) ?? [], [plan]);
  const styleRadio = useRovingRadio(STYLE_IDS, styleId, setStyleId);
  const budgetRadio = useRovingRadio(budgetValues, budget, setPicked);

  const tableHref = tableHrefFor(tableId);
  const tableName = tableLabel(tableId, options.tables, options.live);
  const existingId = useAgentSeats((s) => {
    for (const x of Object.values(s.seats)) if (x.owner.toLowerCase() === owner.toLowerCase() && x.tableId === tableId && x.status !== "stopped") return x.id;
    return undefined;
  });
  const busyElsewhere = existingId != null && existingId !== created;

  const tableProblem = !onChain
    ? null
    : !options.ready
      ? "Reading tables from Robinhood Chain…"
      : options.tables.some((t) => t.id === tableId)
        ? null
        : options.tablesUnreadable
          ? "Robinhood Chain could not be read just now. Retrying."
          : "No table is active onchain right now. Practice is always available.";

  const rules = useMemo(() => (style && budget != null ? quickRules(style, budget) : null), [style, budget]);
  const share = onChain ? AGENT_CAPS.quickAllowanceShareOfBalance : AGENT_CAPS.allowanceShareOfBalance;
  const ruleError =
    rules && budget != null
      ? (validateRules(rules, budget, walletTotal, onChain ? "in your wallet" : undefined, share) ??
        (onChain && balances && !selectChips(balances, budget).exact ? `Your wallet's chips cannot make exactly ${budget}. Pick another amount.` : null))
      : null;
  const blocked = !style || budget == null || !!ruleError || !!tableProblem || busyElsewhere || funding.busy;

  const onStart = () => {
    if (!style || budget == null || !rules) return;
    setError(null);
    const code = quickAgentCode(`${style.id}:${owner}:${Date.now()}:${Math.random()}`);
    const r = create({ name: code, code, thesis: style.description, strategyClass: style.strategyClass, collection: NO_COLLECTION, owner, tableId, rules, allowance: budget, isPublic: false });
    if (!r.ok) return setError(r.error);
    setCreated(r.id);
    if (onChain) {
      // Exactly the advanced builder's path: the agent goes live only once its wallet holds the budget and gas.
      void funding.start(r.id, () => router.push(tableHref));
      return;
    }
    approve(r.id);
    router.push(tableHref);
  };

  const walletLine =
    mode === "practice" ? `${formatNumber(walletTotal)} practice chips` : mode === "simulated" ? `${formatNumber(walletTotal)} chips` : plan ? `${formatNumber(walletTotal)} chips in your wallet` : "Reading your wallet…";

  return (
    <QuickShell
      tableParam={tableParam}
      aside={
        <>
          <span className="microlabel">{walletLine}</span>
          {mode !== "practice" && <Link href={builderHref("quick", "practice")} className="text-muted underline underline-offset-4 hover:text-ink">Practice instead</Link>}
        </>
      }
    >
      <div className="mt-8 space-y-10">
        {/* 1 · style */}
        <section className="space-y-4">
          <StepHead n={1} title="Pick a style" id="qs-style" />
          <div role="radiogroup" aria-labelledby="qs-style" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_STYLES.map((s, i) => {
              const on = s.id === styleId;
              return (
                <button
                  key={s.id}
                  ref={(el) => {
                    styleRadio.refs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={styleRadio.tabIndex(i)}
                  onClick={() => setStyleId(s.id)}
                  onKeyDown={(e) => styleRadio.onKeyDown(i, e)}
                  className={cn("flex min-h-[176px] flex-col rounded-2xl border p-5 text-left transition-colors", focusRing, on ? "border-ink bg-surface dark:bg-elevated" : "border-border hover:border-ink")}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-[16px] font-medium">{s.title}</span>
                    <span aria-hidden className={cn("h-3.5 w-3.5 shrink-0 rounded-full border", on ? "border-ink bg-ink" : "border-border-strong")} />
                  </span>
                  <span className="mt-2 text-[13.5px] leading-snug text-ink-2">{s.description}</span>
                  {s.note && <span className="mt-2 text-[12.5px] leading-snug text-muted">{s.note}</span>}
                  <span className="mt-auto grid grid-cols-2 gap-3 pt-4 font-mono text-[12px] tnum">
                    <span><span className="microlabel block">Wins</span>{winChanceLabel(s.wins)}</span>
                    <span><span className="microlabel block">Pays</span>{s.payout}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[13px] text-muted">{QUICK_EDGE_LINE}</p>
        </section>

        {/* 2 · budget */}
        <section className="space-y-4">
          <StepHead n={2} title="How much?" id="qs-budget" />
          {!plan && <Skeleton className="h-[88px] w-full" />}
          {plan?.kind === "escrow-only" && (
            <div className="space-y-3">
              <p className="text-[14px]">Your {formatNumber(plan.escrow)} chips are at the table. Move them to your wallet first.</p>
              <Button variant="outline" disabled={moveBusy} onClick={onMoveFromTable}>Move {formatNumber(plan.escrow)} chips to my wallet</Button>
            </div>
          )}
          {plan?.kind === "empty" && (
            <div className="space-y-3">
              <p className="text-[14px]">You need chips first.</p>
              <Button variant="outline" href="/cashier">Get chips</Button>
            </div>
          )}
          {plan?.kind === "all-only" && (
            <div className="space-y-3">
              <p className="max-w-2xl text-[14px]">{balances ? denominationNote(balances) : "No smaller amount can be made from your chips."}</p>
              <Button variant={budget === plan.total ? "primary" : "outline"} aria-pressed={budget === plan.total} onClick={() => setPicked(plan.total)}>Use all {formatNumber(plan.total)} chips</Button>
            </div>
          )}
          {plan?.kind === "options" && (
            <div role="radiogroup" aria-labelledby="qs-budget" className="flex flex-wrap gap-2">
              {plan.options.map((o, i) => {
                const on = o.units === budget;
                return (
                  <button
                    key={o.units}
                    ref={(el) => {
                      budgetRadio.refs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={budgetRadio.tabIndex(i)}
                    onClick={() => setPicked(o.units)}
                    onKeyDown={(e) => budgetRadio.onKeyDown(i, e)}
                    className={cn("h-11 rounded-full border px-5 font-mono text-[13px] tnum transition-colors", focusRing, on ? "border-ink bg-ink text-canvas" : "border-border-strong hover:border-ink")}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
          {plan && (plan.kind === "options" || plan.kind === "all-only") && escrowUnits > 0 && onMoveFromTable && (
            <p className="text-[12.5px] text-muted">
              {formatNumber(escrowUnits)} more chips are at the table.{" "}
              <button type="button" className="underline underline-offset-4 hover:text-ink disabled:opacity-40" disabled={moveBusy} onClick={onMoveFromTable}>Move them to your wallet</button> to use them here.
            </p>
          )}
          {budget != null && <p className="max-w-2xl text-[14px] text-ink-2">{quickSummary(budget, mode === "practice")}</p>}
        </section>

        {/* 3 · start */}
        <section className="space-y-4">
          <StepHead n={3} title="Start" id="qs-start" />
          <div className="max-w-2xl rounded-2xl border border-border p-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-3">
              <div><dt className="microlabel">Style</dt><dd className="mt-0.5">{style?.title ?? "—"}</dd></div>
              <div><dt className="microlabel">Budget</dt><dd className="mt-0.5 font-mono tnum">{budget != null ? `${formatNumber(budget)} ${budget === 1 ? "chip" : "chips"}` : "—"}</dd></div>
              <div className="col-span-2 sm:col-span-1"><dt className="microlabel">Table</dt><dd className="mt-0.5">{tableName}</dd></div>
            </dl>
            {budget != null && <p className="mt-4 text-[13.5px] text-ink-2">{quickSummary(budget, mode === "practice")}</p>}
            <ul className="mt-4 list-disc space-y-1 pl-5 text-[13.5px] text-ink-2">
              {onChain ? (
                <>
                  <li>A new wallet is created in this browser for the agent.</li>
                  <li>You approve two transfers: {formatEth(AGENT_GAS_FLOAT_WEI)} ETH for gas and {budget != null ? `${formatNumber(budget)} chips` : "the chip budget you pick"}.</li>
                  <li>It plays only while this tab is open.</li>
                </>
              ) : (
                <>
                  <li>{mode === "practice" ? "It plays the practice table with practice chips. Nothing has value." : `It plays your seat at ${tableName}.`}</li>
                  <li>It plays only while the table is open in this tab.</li>
                  <li>Stop it any time from the table.</li>
                </>
              )}
            </ul>
            {onChain && (
              <details className="mt-4 border-t border-hairline pt-3">
                <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">How it works</summary>
                <ApprovalTerms allowance={budget ?? 0} gasPrice={gasPrice} className="mt-3" />
              </details>
            )}
          </div>

          {busyElsewhere && (
            <p className="text-[13px]">
              You already have an agent at this table. <Link href={tableHref} className="underline underline-offset-4">Open the table</Link> to see it, stop it or discard it.
            </p>
          )}
          {(tableProblem || ruleError || error || funding.error) && (
            <p className={cn("text-[13px]", tableProblem && !ruleError && !error && !funding.error ? "text-muted" : "text-casino-red")} role={ruleError || error || funding.error ? "alert" : undefined}>
              {funding.error ?? error ?? ruleError ?? tableProblem}
            </p>
          )}

          {!created && (
            <Button variant="accent" size="lg" className="w-full sm:w-auto sm:min-w-[240px]" disabled={blocked} onClick={onStart}>
              {funding.preparing ? "Preparing…" : "Start agent"}
            </Button>
          )}
          {!created && (!style || budget == null) ? <p className="microlabel">{!style ? "Pick a style" : "Pick an amount"} to continue.</p> : null}
          {created && onChain && (
            <div className="max-w-2xl space-y-2">
              <p className="text-[13px] text-muted">The agent is saved but has not started. It starts once its wallet is funded; you can also do this from the table.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="accent" disabled={funding.busy} onClick={() => void funding.start(created, () => router.push(tableHref))}>{funding.preparing ? "Preparing…" : "Fund and start"}</Button>
                <Button variant="outline" href={tableHref}>Open table</Button>
              </div>
            </div>
          )}
        </section>
      </div>
      <TransactionModal {...funding.modalProps} />
    </QuickShell>
  );
}
