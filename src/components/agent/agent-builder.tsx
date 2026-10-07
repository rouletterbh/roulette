"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgentSeats, validateRules, AGENT_CAPS, describeRules, type AgentRules, type AgentCadence, type AgentCondition } from "@/store/agent-seat";
import { useStable } from "@/store/stable";
import { useWallet } from "@/store/wallet";
import { useChips } from "@/store/chips";
import { useMounted } from "@/lib/hooks/use-mounted";
import { tableLabel } from "@/lib/agent/options";
import { AgentOptionsProvider, useAgentOptions, vaultNote } from "./agent-options";
import { OUTSIDE_BETS, straight, betFromId } from "@/lib/roulette/bets";
import { agentCode, STRATEGY_CLASSES, type StrategyClass } from "@/lib/agent/states";
import { AgentGlyph } from "./agent-glyph";
import { AgentStrategy } from "./agent-strategy";
import { AgentLeash } from "./agent-leash";
import { AgentDecisionTrace } from "./agent-decision-trace";
import { WalletButton } from "@/components/layout/wallet-button";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn, formatNumber } from "@/lib/utils";
import type { Address } from "viem";
import { siteConfig } from "@/config/site";
import { useChipBalances } from "@/lib/web3/hooks";
import { selectChips, type ChipBalances } from "@/lib/web3/contracts";
import { TransactionModal } from "@/components/cashier/transaction-modal";
import { ApprovalTerms } from "./agent-seat-panel";
import { useAgentFunding, useAgentGasPrice } from "./chain-agent";
import { AgentQuickStart, builderHref } from "./agent-quick-start";

const QUICK_BETS = ["red", "black", "odd", "even", "low", "high", "dozen:1", "dozen:2", "dozen:3", "column:1", "column:2", "column:3"];
const SIDES = [["red", "red"], ["black", "black"], ["odd", "odd"], ["even", "even"], ["low", "1–18"], ["high", "19–36"]] as const;

/**
 * /agents/new. The default is the three-step quick start (AgentQuickStart); the full
 * builder below is "Customise rules" (?mode=advanced), and also opens by itself when a
 * copied thesis draft is waiting (unless ?mode=quick asks for the quick start).
 */
export function AgentBuilder() {
  return (
    <AgentOptionsProvider>
      <BuilderSwitch />
    </AgentOptionsProvider>
  );
}

function BuilderSwitch() {
  const params = useSearchParams();
  const mounted = useMounted();
  const hasDraft = useStable((s) => s.draft != null);
  const mode = params.get("mode");
  // The draft lives in browser storage: only consult it after mount so SSR and hydration agree.
  const advanced = mode === "advanced" || (mode !== "quick" && mounted && hasDraft);
  if (!advanced) return <AgentQuickStart />;
  return siteConfig.demoMode ? <AgentBuilderInner walletChips={null} /> : <ChainBuilder />;
}

/**
 * Advanced builder ("Customise rules"): programming a machine, not filling a form.
 * LEFT configuration · CENTER live strategy preview · RIGHT limits.
 * Sections: 01 When to bet · 02 How often · 03 Limits · 04 Winnings · 05 Approve.
 */

/** Demo mode off: the allowance is funded from the chips in the owner's wallet, read from chain. */
function ChainBuilder() {
  const address = useWallet((s) => s.address);
  const chips = useChipBalances(address as Address | null);
  const ready = chips.enabled && !chips.isLoading;
  // The form's starting allowance is derived from the wallet's chips, so wait for the first read.
  if (address && !ready) return <div className="container-edge py-24" aria-busy="true" />;
  return <AgentBuilderInner walletChips={{ units: chips.units, balances: chips.balances, ready }} />;
}

function AgentBuilderInner({ walletChips }: { walletChips: { units: number; balances: ChipBalances; ready: boolean } | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const mounted = useMounted();
  const wallet = useWallet();
  const chipsBalance = useChips((s) => s.balance);
  const create = useAgentSeats((s) => s.create);
  const approve = useAgentSeats((s) => s.approve);
  const draft = useStable((s) => s.draft);
  const setDraft = useStable((s) => s.setDraft);
  const options = useAgentOptions();
  const inv = options.assets;

  const tableParam = params.get("table") ?? "quick";
  const [tableId, setTableId] = useState(tableParam);
  // With demo mode off the selected table decides the mode: a practice agent is simulated, every other
  // agent plays on chain from its own wallet, funded from the owner's wallet chips. (Demo mode keeps
  // deciding from the URL, as before.)
  const practice = walletChips ? tableId === "practice" : tableParam === "practice";
  const onChain = !!walletChips && !practice;
  const balance = practice ? 1000 : walletChips ? walletChips.units : chipsBalance;
  const funding = useAgentFunding();
  const gasPrice = useAgentGasPrice();
  const owner = practice ? "practice" : wallet.address ?? "";

  const draftIsStraight = !!draft && draft.betId.startsWith("straight:");
  const [name, setName] = useState(draft?.name ?? "");
  const [thesis, setThesis] = useState("");
  const [strategyClass, setStrategyClass] = useState<StrategyClass>("Adaptive Low Variance");
  const [condOn, setCondOn] = useState(true);
  const [cond, setCond] = useState<AgentCondition>({ type: "color-count", side: "red", window: 5, min: 3 });
  const [betId, setBetId] = useState(draft ? (draftIsStraight ? "straight" : draft.betId) : "black");
  const [straightN, setStraightN] = useState(draftIsStraight ? Number(draft!.betId.split(":")[1]) : 17);
  const [stake, setStake] = useState(draft?.stake ?? 2);
  const [cadence, setCadence] = useState<AgentCadence>(condOn ? "after-condition" : ((draft?.cadence as AgentCadence) ?? "every"));
  const [interval, setInterval_] = useState(3);
  const defaultAllowance = Math.max(1, Math.floor(balance * 0.2));
  const [allowance, setAllowance] = useState(defaultAllowance);
  const [stopLoss, setStopLoss] = useState(Math.min(defaultAllowance, draft?.stopLoss ?? Math.max(1, Math.floor(defaultAllowance / 2))));
  const [stopWin, setStopWin] = useState<number | "">(draft?.stopWin ?? "");
  const [maxRounds, setMaxRounds] = useState(draft?.maxRounds ?? 60);
  const [timeLimit, setTimeLimit] = useState(draft?.timeLimitMinutes ?? 45);
  const [maxBet, setMaxBet] = useState(Math.max(stake, 4));
  const [primaryAsset, setPrimaryAsset] = useState<string>(practice ? "" : (inv.find((i) => i.status === "available")?.id ?? ""));
  const [fallbackAsset, setFallbackAsset] = useState<string>("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const resolvedBet = betId === "straight" ? straight(straightN).id : betId;
  const rules: AgentRules = useMemo(
    () => ({ bets: [{ betId: resolvedBet, stake }], cadence: condOn ? "after-condition" : cadence, interval, condition: condOn ? cond : null, maxBet, maxRounds, stopLoss, stopWin: stopWin === "" ? null : Number(stopWin), timeLimitMinutes: timeLimit }),
    [resolvedBet, stake, condOn, cadence, interval, cond, maxBet, maxRounds, stopLoss, stopWin, timeLimit],
  );
  const denominations = onChain && walletChips ? selectChips(walletChips.balances, allowance) : null;
  const liveError =
    validateRules(rules, allowance, balance, onChain ? "in your wallet" : undefined) ??
    (maxBet < stake ? "Maximum bet must cover the stake." : null) ??
    (denominations && !denominations.exact ? `Your wallet's chip denominations can make ${denominations.units} chips, not ${allowance}. Change the allowance.` : null);
  const view = useMemo(() => describeRules(rules), [rules]);
  const expectedLoss = (stake * maxRounds) / 37;
  const code = agentCode(name || "draft");
  const betLabel = betFromId(resolvedBet)?.label ?? "";
  const sentence = condOn
    ? `When the last ${cond.window} rounds show ${cond.min} or more ${cond.type === "zero-absent" ? "non-zero results" : SIDES.find(([k]) => k === cond.side)?.[1] ?? cond.side} results, place ${stake} chip${stake > 1 ? "s" : ""} on ${betLabel}.`
    : `Every ${cadence === "interval" ? `${interval} rounds` : cadence.replace("-", " ")}, place ${stake} chip${stake > 1 ? "s" : ""} on ${betLabel}.`;

  const tableName = tableLabel(tableId, options.tables, options.live);
  // Honest about the 50% cap, including the case where there is nothing to give.
  const allowanceCap = Math.floor(balance * AGENT_CAPS.allowanceShareOfBalance);
  const allowanceLabel =
    balance <= 0
      ? `Chip allowance (${onChain ? "your wallet has no chips" : "no chips available"})`
      : `Chip allowance (at most half of your ${formatNumber(balance)} ${balance === 1 ? "chip" : "chips"}: ${formatNumber(allowanceCap)})`;
  const tableHref = tableId === "practice" ? "/play/practice" : tableId === "quick" ? "/play/quick" : `/table/${tableId}`;

  const field = "h-9 w-full border-b border-border bg-transparent px-0 font-mono text-[13px] tnum outline-none focus:border-ink";
  const label = "microlabel mb-1 block";
  const sectionHead = (n: string, t: string, q?: string) => (
    <div className="flex items-baseline gap-3 border-t border-ink pt-3"><span className="font-mono text-[11px] text-faint">{n}</span><h2 className="font-mono text-[12px] uppercase tracking-[0.14em]">{t}</h2>{q && <span className="ml-auto text-[12px] text-muted">{q}</span>}</div>
  );

  if (!mounted) return <div className="container-edge py-24" aria-busy="true" />;
  if (!practice && wallet.status !== "connected") {
    return (
      <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Eyebrow className="mb-4 block">Agent builder</Eyebrow>
        <h1 className="font-display text-display-md">Connect to program an agent.</h1>
        <p className="mt-4 max-w-md text-muted">Agents play your seat with your chips. Nothing runs until you approve it.</p>
        <div className="mt-8 flex gap-3"><WalletButton /><Button href={builderHref("advanced", "practice")} variant="outline">Build a practice agent</Button></div>
      </div>
    );
  }

  const onApprove = () => {
    const r = create({ name, thesis: thesis || sentence, strategyClass, collection: { primaryAssetId: primaryAsset || null, fallbackAssetId: fallbackAsset || null }, owner, tableId, rules, allowance, isPublic });
    if (!r.ok) { setError(r.error); return; }
    setDraft(null);
    setCreated(r.id);
    if (onChain) {
      // Approval is the funding step: the agent goes live only once its wallet holds the allowance and gas.
      void funding.start(r.id, () => router.push(tableHref));
      return;
    }
    approve(r.id);
    router.push(tableHref);
  };

  return (
    <div className="container-edge hero-glow blueprint py-10 md:py-14">
      <div className="relative z-10 flex flex-col gap-4 border-b border-ink pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-5">
          <AgentGlyph seed={name || "draft"} state={liveError ? "paused" : "thinking"} size={64} className="text-ink" />
          <div>
            <Eyebrow className="mb-2 block">Agent builder · custom rules</Eyebrow>
            <h1 className="font-display text-display-sm leading-none">{name || "Untitled agent"} <span className="font-mono text-[14px] uppercase tracking-[0.08em] text-muted">{code}</span></h1>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end"><Link href={builderHref("quick", params.get("table"))} className="text-[13px] text-muted underline underline-offset-4 hover:text-ink">Back to quick start</Link><div className="microlabel">table · {tableName} · {practice ? "practice chips" : onChain ? (walletChips?.ready ? `${formatNumber(balance)} chips in your wallet` : "reading your wallet…") : `${formatNumber(balance)} chips available`}</div></div>
      </div>

      <div className="relative z-10 mt-8 grid gap-10 lg:grid-cols-[1.1fr_1fr_0.9fr] lg:gap-12">
        {/* LEFT — configuration */}
        <div className="space-y-8">
          <section className="space-y-4">
            {sectionHead("01", "When to bet", "What it bets, and when")}
            <div><label className={label} htmlFor="b-name">Name</label><input id="b-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Steady black" className={field} /></div>
            <div><label className={label} htmlFor="b-class">Strategy class (optional)</label><select id="b-class" value={strategyClass} onChange={(e) => setStrategyClass(e.target.value as StrategyClass)} className={field}>{STRATEGY_CLASSES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={condOn} onChange={(e) => setCondOn(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ink)]" />Act only when a condition is met</label>
            {condOn && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={label} htmlFor="b-ctype">Condition</label>
                  <select id="b-ctype" value={cond.type} onChange={(e) => setCond({ ...cond, type: e.target.value as AgentCondition["type"], side: e.target.value === "parity-count" ? "odd" : e.target.value === "half-count" ? "low" : cond.side })} className={field}>
                    <option value="color-count">Color count</option><option value="parity-count">Parity count</option><option value="half-count">Half count</option><option value="zero-absent">No zero in window</option>
                  </select></div>
                {cond.type !== "zero-absent" && (
                  <div><label className={label} htmlFor="b-side">Side</label>
                    <select id="b-side" value={cond.side} onChange={(e) => setCond({ ...cond, side: e.target.value as AgentCondition["side"] })} className={field}>
                      {SIDES.filter(([k]) => (cond.type === "color-count" ? k === "red" || k === "black" : cond.type === "parity-count" ? k === "odd" || k === "even" : k === "low" || k === "high")).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select></div>
                )}
                <div><label className={label} htmlFor="b-win">Window (rounds)</label><input id="b-win" type="number" min={1} max={12} value={cond.window} onChange={(e) => setCond({ ...cond, window: Math.max(1, Math.min(12, Number(e.target.value))), min: Math.min(cond.min, Math.max(1, Math.min(12, Number(e.target.value)))) })} className={field} /></div>
                <div><label className={label} htmlFor="b-min">Minimum count</label><input id="b-min" type="number" min={1} max={cond.window} value={cond.min} onChange={(e) => setCond({ ...cond, min: Math.max(1, Math.min(cond.window, Number(e.target.value))) })} className={field} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><label className={label} htmlFor="b-bet">Then bet</label>
                <select id="b-bet" value={betId} onChange={(e) => setBetId(e.target.value)} className={field}>
                  {QUICK_BETS.map((b) => <option key={b} value={b}>{OUTSIDE_BETS[b].label}</option>)}<option value="straight">Straight number…</option>
                </select></div>
              {betId === "straight" ? <div><label className={label} htmlFor="b-n">Number</label><input id="b-n" type="number" min={0} max={36} value={straightN} onChange={(e) => setStraightN(Math.max(0, Math.min(36, Number(e.target.value))))} className={field} /></div> : <div><label className={label} htmlFor="b-stake">Size (chips)</label><input id="b-stake" type="number" min={1} value={stake} onChange={(e) => setStake(Math.max(1, Number(e.target.value)))} className={field} /></div>}
            </div>
          </section>

          <section className="space-y-4">
            {sectionHead("02", "How often")}
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="How often">
              {([["every", "Every round"], ["interval", "Every N rounds"], ["after-loss", "After a loss"], ["after-condition", "After condition"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={(condOn ? "after-condition" : cadence) === v} disabled={condOn && v !== "after-condition"} onClick={() => setCadence(v)} className={cn("border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-40", (condOn ? "after-condition" : cadence) === v ? "border-ink bg-ink text-canvas" : "border-border hover:border-ink")}>{l}</button>
              ))}
              {cadence === "interval" && !condOn && <input type="number" min={2} max={20} value={interval} onChange={(e) => setInterval_(Math.max(2, Number(e.target.value)))} aria-label="Interval rounds" className="ml-2 h-8 w-16 border-b border-border bg-transparent font-mono text-[13px] outline-none focus:border-ink" />}
            </div>
          </section>

          {!practice && (
            <section className="space-y-4">
              {sectionHead("04", "Winnings", "When winnings settle")}
              <div className="grid grid-cols-2 gap-4">
                <div><label className={label} htmlFor="b-col">Claim into</label><select id="b-col" value={primaryAsset} onChange={(e) => setPrimaryAsset(e.target.value)} className={field}><option value="">Keep as chips / win balance</option>{inv.map((i) => <option key={i.id} value={i.id} disabled={!i.selectable}>{i.symbol} · {i.statusLabel}</option>)}</select></div>
                <div><label className={label} htmlFor="b-fb">Fallback</label><select id="b-fb" value={fallbackAsset} onChange={(e) => setFallbackAsset(e.target.value)} className={field}><option value="">Win balance</option>{inv.filter((i) => i.id !== primaryAsset).map((i) => <option key={i.id} value={i.id} disabled={!i.selectable}>{i.symbol} · {i.statusLabel}</option>)}</select></div>
              </div>
              <p className="microlabel">Stock Token inventory appears here only where the vault holds it and your jurisdiction is enabled.</p>
              {options.live && !inv.some((i) => i.selectable) && <p className="microlabel">{vaultNote(options)}</p>}
            </section>
          )}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ink)]" />Public profile · others can follow and read the thesis and log</label>
          <div><label className={label} htmlFor="b-table">Table</label><select id="b-table" value={tableId} onChange={(e) => setTableId(e.target.value)} className={field}>{options.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}{!options.tables.some((t) => t.id === tableId) && tableId !== "practice" && <option value={tableId} disabled={options.live && options.ready}>{options.live ? (options.tablesUnreadable ? "Tables could not be read" : options.ready ? "No onchain table is active" : "Reading tables…") : tableName}</option>}<option value="practice">Practice (no value)</option></select>{options.live && options.ready && options.tables.length === 0 && <p className="mt-1.5 microlabel">{options.tablesUnreadable ? "Robinhood Chain could not be read just now, so tables are not listed. Retrying." : "No table is active onchain right now."} Practice is always available.</p>}</div>
        </div>

        {/* CENTER — live strategy preview */}
        <div className="space-y-6 lg:border-l lg:border-hairline lg:pl-10">
          <div className="microlabel">Live strategy preview</div>
          <AgentStrategy s={view} sentence={sentence} />
          <div><label className={label} htmlFor="b-thesis">Public thesis (optional, one line)</label><input id="b-thesis" value={thesis} onChange={(e) => setThesis(e.target.value)} maxLength={120} placeholder={sentence} className={field} /></div>
          <AgentDecisionTrace compact trace={{ roundId: 4821, at: 0, decision: `BET ${betLabel.toUpperCase()}`, rule: view.when, input: condOn ? (cond.side === "black" ? "B R B B R" : "R B R R B") : "R B R R B", condition: true, leash: "pass", leashNote: `${stopLoss} to stop loss`, maxAllowed: Math.min(maxBet, allowance), wager: stake, tx: null }} />
          <p className="text-[12px] leading-relaxed text-muted">The wheel keeps 1/37 of every chip bet. At {stake} per decision for up to {maxRounds} rounds this agent is expected to lose about <span className="font-mono text-ink">{formatNumber(expectedLoss, { maximumFractionDigits: 1 })} chips</span>. Agents execute rules; they do not predict the wheel.</p>
        </div>

        {/* RIGHT — leash */}
        <div className="space-y-6 lg:border-l lg:border-hairline lg:pl-10">
          {sectionHead("03", "Limits")}
          <AgentLeash usage={{ chips: allowance, chipsMax: allowance, loss: 0, lossMax: stopLoss, rounds: 0, roundsMax: maxRounds, minutes: 0, minutesMax: timeLimit }} size={150} compact className="mx-auto" />
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label} htmlFor="b-allow">{allowanceLabel}</label><input id="b-allow" type="number" min={1} value={allowance} onChange={(e) => setAllowance(Math.max(1, Number(e.target.value)))} className={field} /></div>
            <div><label className={label} htmlFor="b-sl">Stop loss</label><input id="b-sl" type="number" min={1} value={stopLoss} onChange={(e) => setStopLoss(Math.max(1, Number(e.target.value)))} className={field} /></div>
            <div><label className={label} htmlFor="b-rounds">Maximum rounds (≤ {AGENT_CAPS.maxRounds})</label><input id="b-rounds" type="number" min={1} max={AGENT_CAPS.maxRounds} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} className={field} /></div>
            <div><label className={label} htmlFor="b-time">Maximum time (≤ {AGENT_CAPS.maxTimeMinutes} min)</label><input id="b-time" type="number" min={1} max={AGENT_CAPS.maxTimeMinutes} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} className={field} /></div>
            <div><label className={label} htmlFor="b-maxbet">Maximum bet</label><input id="b-maxbet" type="number" min={1} value={maxBet} onChange={(e) => setMaxBet(Math.max(1, Number(e.target.value)))} className={field} /></div>
            <div><label className={label} htmlFor="b-sw">Stop win (optional)</label><input id="b-sw" type="number" min={1} value={stopWin} onChange={(e) => setStopWin(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))} placeholder="—" className={field} /></div>
          </div>

          <section className="space-y-3">
            {sectionHead("05", "Approve agent")}
            <div className="border border-ink p-4 text-[13.5px] leading-relaxed">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{code} will:</p>
              <ul className="mt-2 space-y-1">
                <li>Watch {tableName}.</li>
                <li>Bet only on {betLabel}{condOn ? `, only when ${view.when}` : ""}.</li>
                <li>Maximum {Math.min(maxBet, allowance)} chips per decision.</li>
                <li>Stop after losing {stopLoss} chips.</li>
                <li>Stop after {maxRounds} rounds.</li>
                <li>Never exceed {timeLimit} minutes.</li>
              </ul>
              <p className="mt-3 microlabel">Nothing happens until you approve.</p>
            </div>
            {onChain && <ApprovalTerms allowance={allowance} gasPrice={gasPrice} className="border border-hairline p-4" />}
            <p className={cn("text-[12px]", liveError || error || funding.error ? "text-casino-red" : "text-muted")} role={liveError || error || funding.error ? "alert" : undefined}>{funding.error ?? error ?? liveError ?? "All limits inside caps."}</p>
            {!created && <Button variant="accent" size="lg" className="w-full" disabled={!!liveError || funding.busy} onClick={onApprove}>{onChain ? "Approve & fund" : "Approve & activate"}</Button>}
            {created && onChain && (
              <div className="space-y-2">
                <p className="text-[12.5px] text-muted">The agent is saved and is not live yet. It starts once its wallet is funded; you can also do this from the agent seat at the table.</p>
                <div className="flex gap-2">
                  <Button variant="accent" className="flex-1" disabled={funding.busy} onClick={() => void funding.start(created, () => router.push(tableHref))}>{funding.preparing ? "Preparing…" : "Fund agent wallet"}</Button>
                  <Button variant="outline" href={tableHref}>Open table</Button>
                </div>
              </div>
            )}
            {created && !onChain && <Button variant="accent" size="lg" className="w-full" disabled>Approve &amp; activate</Button>}
          </section>
        </div>
      </div>
      <TransactionModal {...funding.modalProps} />
    </div>
  );
}
