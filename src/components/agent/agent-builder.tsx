"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgentSeats, validateRules, AGENT_CAPS, describeRules, type AgentRules, type AgentCadence, type AgentCondition } from "@/store/agent-seat";
import { useStable } from "@/store/stable";
import { useWallet } from "@/store/wallet";
import { useChips } from "@/store/chips";
import { useMounted } from "@/lib/hooks/use-mounted";
import { getRewardInventory } from "@/lib/demo/rewards";
import { demoTables } from "@/lib/demo/data";
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

const QUICK_BETS = ["red", "black", "odd", "even", "low", "high", "dozen:1", "dozen:2", "dozen:3", "column:1", "column:2", "column:3"];
const SIDES = [["red", "red"], ["black", "black"], ["odd", "odd"], ["even", "even"], ["low", "1–18"], ["high", "19–36"]] as const;

/**
 * Agent builder: programming a machine, not filling a form.
 * LEFT configuration · CENTER live strategy preview · RIGHT leash.
 * Sections: 01 Thesis · 02 Cadence · 03 Leash · 04 Collection · 05 Approve.
 */
export function AgentBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const mounted = useMounted();
  const wallet = useWallet();
  const chipsBalance = useChips((s) => s.balance);
  const create = useAgentSeats((s) => s.create);
  const approve = useAgentSeats((s) => s.approve);
  const draft = useStable((s) => s.draft);
  const setDraft = useStable((s) => s.setDraft);
  const inv = getRewardInventory();

  const tableParam = params.get("table") ?? "quick";
  const practice = tableParam === "practice";
  const balance = practice ? 1000 : chipsBalance;
  const owner = practice ? "practice" : wallet.address ?? "";

  const draftIsStraight = !!draft && draft.betId.startsWith("straight:");
  const [name, setName] = useState(draft?.name ?? "");
  const [thesis, setThesis] = useState("");
  const [strategyClass, setStrategyClass] = useState<StrategyClass>("Adaptive Low Variance");
  const [tableId, setTableId] = useState(tableParam);
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
  const [primaryAsset, setPrimaryAsset] = useState<string>(practice ? "" : (inv.find((i) => i.status === "available")?.token.id ?? ""));
  const [fallbackAsset, setFallbackAsset] = useState<string>("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const resolvedBet = betId === "straight" ? straight(straightN).id : betId;
  const rules: AgentRules = useMemo(
    () => ({ bets: [{ betId: resolvedBet, stake }], cadence: condOn ? "after-condition" : cadence, interval, condition: condOn ? cond : null, maxBet, maxRounds, stopLoss, stopWin: stopWin === "" ? null : Number(stopWin), timeLimitMinutes: timeLimit }),
    [resolvedBet, stake, condOn, cadence, interval, cond, maxBet, maxRounds, stopLoss, stopWin, timeLimit],
  );
  const liveError = validateRules(rules, allowance, balance) ?? (maxBet < stake ? "Maximum bet must cover the stake." : null);
  const view = useMemo(() => describeRules(rules), [rules]);
  const expectedLoss = (stake * maxRounds) / 37;
  const code = agentCode(name || "draft");
  const betLabel = betFromId(resolvedBet)?.label ?? "";
  const sentence = condOn
    ? `When the last ${cond.window} rounds show ${cond.min} or more ${cond.type === "zero-absent" ? "non-zero results" : SIDES.find(([k]) => k === cond.side)?.[1] ?? cond.side} results, place ${stake} chip${stake > 1 ? "s" : ""} on ${betLabel}.`
    : `Every ${cadence === "interval" ? `${interval} rounds` : cadence.replace("-", " ")}, place ${stake} chip${stake > 1 ? "s" : ""} on ${betLabel}.`;

  const tableName = demoTables.find((t) => t.id === tableId)?.name ?? (tableId === "practice" ? "Practice table" : tableId === "quick" ? "Quick play" : tableId);
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
        <div className="mt-8 flex gap-3"><WalletButton /><Button href="/agents/new?table=practice" variant="outline">Build a practice agent</Button></div>
      </div>
    );
  }

  const onApprove = () => {
    const r = create({ name, thesis: thesis || sentence, strategyClass, collection: { primaryAssetId: primaryAsset || null, fallbackAssetId: fallbackAsset || null }, owner, tableId, rules, allowance, isPublic });
    if (!r.ok) { setError(r.error); return; }
    approve(r.id);
    setDraft(null);
    setCreated(r.id);
    router.push(tableHref);
  };

  return (
    <div className="container-edge blueprint py-10 md:py-14">
      <div className="relative z-10 flex flex-col gap-4 border-b border-ink pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-5">
          <AgentGlyph seed={name || "draft"} state={liveError ? "paused" : "thinking"} size={64} className="text-ink" />
          <div>
            <Eyebrow className="mb-2 block">Agent builder</Eyebrow>
            <h1 className="font-display text-display-sm leading-none">{name || "Untitled agent"} <span className="font-mono text-[14px] uppercase tracking-[0.08em] text-muted">{code}</span></h1>
          </div>
        </div>
        <div className="microlabel">table · {tableName} · {practice ? "practice chips" : `${formatNumber(balance)} chips available`}</div>
      </div>

      <div className="relative z-10 mt-8 grid gap-10 lg:grid-cols-[1.1fr_1fr_0.9fr] lg:gap-12">
        {/* LEFT — configuration */}
        <div className="space-y-8">
          <section className="space-y-4">
            {sectionHead("01", "Thesis", "When should this agent act?")}
            <div><label className={label} htmlFor="b-name">Name</label><input id="b-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Steady black" className={field} /></div>
            <div><label className={label} htmlFor="b-class">Strategy class</label><select id="b-class" value={strategyClass} onChange={(e) => setStrategyClass(e.target.value as StrategyClass)} className={field}>{STRATEGY_CLASSES.map((c) => <option key={c}>{c}</option>)}</select></div>
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
            {sectionHead("02", "Cadence")}
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Cadence">
              {([["every", "Every round"], ["interval", "Every N rounds"], ["after-loss", "After a loss"], ["after-condition", "After condition"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={(condOn ? "after-condition" : cadence) === v} disabled={condOn && v !== "after-condition"} onClick={() => setCadence(v)} className={cn("border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-40", (condOn ? "after-condition" : cadence) === v ? "border-ink bg-ink text-canvas" : "border-border hover:border-ink")}>{l}</button>
              ))}
              {cadence === "interval" && !condOn && <input type="number" min={2} max={20} value={interval} onChange={(e) => setInterval_(Math.max(2, Number(e.target.value)))} aria-label="Interval rounds" className="ml-2 h-8 w-16 border-b border-border bg-transparent font-mono text-[13px] outline-none focus:border-ink" />}
            </div>
          </section>

          {!practice && (
            <section className="space-y-4">
              {sectionHead("04", "Collection rule", "When winnings settle")}
              <div className="grid grid-cols-2 gap-4">
                <div><label className={label} htmlFor="b-col">Claim into</label><select id="b-col" value={primaryAsset} onChange={(e) => setPrimaryAsset(e.target.value)} className={field}><option value="">Keep as chips / win balance</option>{inv.map((i) => <option key={i.token.id} value={i.token.id} disabled={i.status !== "available" && i.status !== "low"}>{i.token.symbol} · {i.statusLabel}</option>)}</select></div>
                <div><label className={label} htmlFor="b-fb">Fallback</label><select id="b-fb" value={fallbackAsset} onChange={(e) => setFallbackAsset(e.target.value)} className={field}><option value="">Win balance</option>{inv.filter((i) => i.token.id !== primaryAsset).map((i) => <option key={i.token.id} value={i.token.id} disabled={i.status !== "available" && i.status !== "low"}>{i.token.symbol} · {i.statusLabel}</option>)}</select></div>
              </div>
              <p className="microlabel">Stock Token inventory appears here only where the vault holds it and your jurisdiction is enabled.</p>
            </section>
          )}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ink)]" />Public profile · others can follow and read the thesis and log</label>
          <div><label className={label} htmlFor="b-table">Table</label><select id="b-table" value={tableId} onChange={(e) => setTableId(e.target.value)} className={field}><option value="quick">Quick play (solo)</option>{demoTables.filter((t) => t.status === "live").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="practice">Practice (no value)</option></select></div>
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
          {sectionHead("03", "Leash")}
          <AgentLeash usage={{ chips: allowance, chipsMax: allowance, loss: 0, lossMax: stopLoss, rounds: 0, roundsMax: maxRounds, minutes: 0, minutesMax: timeLimit }} size={150} compact className="mx-auto" />
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label} htmlFor="b-allow">Chip allowance (≤ {Math.floor(balance * AGENT_CAPS.allowanceShareOfBalance)})</label><input id="b-allow" type="number" min={1} value={allowance} onChange={(e) => setAllowance(Math.max(1, Number(e.target.value)))} className={field} /></div>
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
            <p className={cn("text-[12px]", liveError || error ? "text-casino-red" : "text-muted")} role={liveError || error ? "alert" : undefined}>{error ?? liveError ?? "All limits inside caps."}</p>
            <Button variant="accent" size="lg" className="w-full" disabled={!!liveError || !!created} onClick={onApprove}>Approve &amp; activate</Button>
          </section>
        </div>
      </div>
    </div>
  );
}
