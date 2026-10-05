"use client";

import { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { siteConfig } from "@/config/site";
import { useChipBalances } from "@/lib/web3/hooks";
import { deleteAgentKey } from "@/lib/agent-wallet/keystore";
import { bumpAgentKeys, kickAgentRunners } from "@/lib/agent-wallet/manager";
import { agentIOFor } from "@/lib/agent-wallet/signer";
import { useMounted } from "@/lib/hooks/use-mounted";
import { TransactionModal } from "@/components/cashier/transaction-modal";
import { AgentDecisionTrace } from "./agent-decision-trace";
import { AGENT_TAB_NOTE, AGENT_WALLET_EXPLAINER, AgentWalletPanel, gasFloatLine, useAgentFunding, useAgentGasPrice, useAgentKey } from "./chain-agent";
import { AnimatePresence, motion } from "motion/react";
import { useAgentSeats, validateRules, AGENT_CAPS, type AgentRules, type AgentCadence } from "@/store/agent-seat";
import { useAgentDriver } from "./use-agent-driver";
import { AgentLog } from "./agent-log";
import { OUTSIDE_BETS, straight, betFromId } from "@/lib/roulette/bets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import { AgentOptionsProvider, useAgentOptions, vaultNote } from "./agent-options";
import { useStable } from "@/store/stable";

const QUICK_BETS = ["red", "black", "odd", "even", "low", "high", "dozen:1", "dozen:2", "dozen:3", "column:1", "column:2", "column:3"];

interface AgentSeatPanelProps {
  owner: string;
  tableId: string;
  balance: number;
  shared: boolean;
  practice?: boolean;
  className?: string;
}

/**
 * Reward-asset choices come from the options provider: simulated in demo mode, the reward vault on chain otherwise.
 * With demo mode off a real-money seat is played on chain by the agent's own burner wallet (ChainAgentSeatPanel);
 * practice tables and demo mode keep the simulated driver untouched.
 */
export function AgentSeatPanel(props: AgentSeatPanelProps) {
  const onChain = !siteConfig.demoMode && !props.practice;
  return <AgentOptionsProvider>{onChain ? <ChainAgentSeatPanel {...props} /> : <AgentSeatPanelInner {...props} />}</AgentOptionsProvider>;
}

function AgentSeatPanelInner({ owner, tableId, balance, shared, practice, className }: AgentSeatPanelProps) {
  const seats = useAgentSeats((s) => s.seats);
  const seat = Object.values(seats).find((s) => s.owner === owner && s.tableId === tableId && s.status !== "stopped");
  const lastStopped = Object.values(seats).filter((s) => s.owner === owner && s.tableId === tableId && s.status === "stopped").sort((a, b) => b.createdAt - a.createdAt)[0];
  const actions = useAgentSeats();
  const [building, setBuilding] = useState(false);
  useAgentDriver(seat, shared);

  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 dark:bg-elevated", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Agent seat</h2>
        <Badge tone="outline">Beta</Badge>
      </div>

      {!seat && !building && (
        <div>
          <p className="text-[13px] leading-relaxed text-muted">Set rules, approve them, and let an agent play your seat. It gets its own chip allowance, a mandatory stop-loss and time limit, and logs every decision.</p>
          {lastStopped && (
            <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[12px] text-muted dark:bg-surface">
              Last agent <span className="text-ink">{lastStopped.name}</span> stopped: {lastStopped.stoppedReason}. Net {lastStopped.net >= 0 ? "+" : ""}{formatNumber(lastStopped.net)} over {lastStopped.roundsPlayed} rounds. <Link href={`/agent/${lastStopped.id}`} className="underline underline-offset-2">Log</Link>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="accent" className="flex-1" href={`/agents/new?table=${encodeURIComponent(tableId)}`}>Program an agent</Button>
            <Button size="sm" variant="ghost" onClick={() => setBuilding(true)}>Quick rules</Button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {building && !seat && (
          <motion.div key="builder" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AgentBuilder owner={owner} tableId={tableId} balance={balance} practice={practice} onDone={() => setBuilding(false)} onCancel={() => setBuilding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {seat && (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-medium">{seat.name}</div>
              <div className="text-[12px] text-muted">{seat.rules.bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label}`).join(" · ")}</div>
            </div>
            <Badge tone={seat.status === "active" ? "accent" : seat.status === "pending-approval" ? "amber" : "muted"}>
              {seat.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
              {seat.status === "pending-approval" ? "Needs approval" : seat.status}
            </Badge>
          </div>

          {seat.status === "pending-approval" && (
            <div className="mt-4 rounded-xl border border-dashed border-border-strong p-3 text-[12.5px]">
              <p className="mb-2 font-medium">Check in before it goes live</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tnum text-muted">
                <dt>Allowance</dt><dd className="text-right text-ink">{formatNumber(seat.allowance)} chips</dd>
                <dt>Stop-loss</dt><dd className="text-right text-ink">−{formatNumber(seat.rules.stopLoss)}</dd>
                <dt>Stop-win</dt><dd className="text-right text-ink">{seat.rules.stopWin != null ? `+${formatNumber(seat.rules.stopWin)}` : "none"}</dd>
                <dt>Rounds</dt><dd className="text-right text-ink">≤ {seat.rules.maxRounds}</dd>
                <dt>Time limit</dt><dd className="text-right text-ink">{seat.rules.timeLimitMinutes} min</dd>
                <dt>Cadence</dt><dd className="text-right text-ink">{seat.rules.cadence}</dd>
              </dl>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="accent" className="flex-1" onClick={() => actions.approve(seat.id)}>Approve and go live</Button>
                <Button size="sm" variant="ghost" onClick={() => actions.remove(seat.id)}>Discard</Button>
              </div>
            </div>
          )}

          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-[12px] tnum">
            <div><dt className="text-muted">Rounds</dt><dd className="font-medium">{seat.roundsPlayed} <span className="text-muted">/ {seat.rules.maxRounds}</span></dd></div>
            <div><dt className="text-muted">Net</dt><dd className={cn("font-medium", seat.net > 0 && "text-ink", seat.net < 0 && "text-casino-red")}>{seat.net >= 0 ? "+" : ""}{formatNumber(seat.net)}</dd></div>
            <div><dt className="text-muted">To stop-loss</dt><dd className="font-medium">{formatNumber(Math.max(0, seat.rules.stopLoss + seat.net))}</dd></div>
          </dl>

          <AgentLog items={seat.log} max={6} className="mt-3 border-t border-hairline pt-3" />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {seat.status === "active" && <Button size="sm" variant="outline" onClick={() => actions.pause(seat.id)}>Pause</Button>}
            {seat.status === "paused" && <Button size="sm" variant="outline" onClick={() => actions.resume(seat.id)}>Resume</Button>}
            {seat.status !== "pending-approval" && <Button size="sm" variant="ghost" onClick={() => actions.stop(seat.id, "Stopped by owner.")}>Stop</Button>}
            <Link href={`/agent/${seat.id}`} className="ml-auto text-[12px] text-muted underline-offset-2 hover:underline">{seat.isPublic ? "Public profile" : "Private log"}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Chain mode: the seat is played by a burner wallet the owner funds.
   Approval is the funding step; Stop returns everything by itself.
------------------------------------------------------------------ */
function ChainAgentSeatPanel({ owner, tableId, className }: AgentSeatPanelProps) {
  const mounted = useMounted();
  const seats = useAgentSeats((s) => s.seats);
  const mine = Object.values(seats).filter((s) => s.owner.toLowerCase() === owner.toLowerCase() && s.tableId === tableId);
  const seat = mine.find((s) => s.status !== "stopped");
  const lastStopped = mine.filter((s) => s.status === "stopped").sort((a, b) => b.createdAt - a.createdAt)[0];
  const actions = useAgentSeats();
  const chips = useChipBalances(owner ? (owner as Address) : null);
  const funding = useAgentFunding();
  const gasPrice = useAgentGasPrice();
  const seatKey = useAgentKey(seat?.id);
  const stoppedKey = useAgentKey(lastStopped?.id);
  const [building, setBuilding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // A seat is only thrown away once its wallet (if it ever got one) is verifiably empty.
  const discard = async (id: string) => {
    setNote(null);
    setDiscarding(true);
    try {
      const io = agentIOFor(id);
      if (io) {
        const snap = await io.snapshot().catch(() => null);
        const r = deleteAgentKey(id, snap ? { chipUnits: snap.chipUnits, escrow: snap.escrow, winBalance: snap.winBalance, eth: snap.eth } : null);
        if (!r.ok) return setNote(`${r.reason} Use "Sweep back to my wallet" below, then discard.`);
        bumpAgentKeys();
      }
      actions.remove(id);
    } finally {
      setDiscarding(false);
    }
  };

  const lastTrace = seat?.traces[seat.traces.length - 1];
  const legacy = !!seat && seat.status !== "pending-approval" && !seat.chain;

  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 dark:bg-elevated", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Agent seat</h2>
        <Badge tone="outline">Onchain · Beta</Badge>
      </div>

      {!mounted && <div className="min-h-[120px]" aria-busy="true" />}

      {mounted && !seat && !building && (
        <div>
          <p className="text-[13px] leading-relaxed text-muted">Set rules, approve them, and an agent plays from its own wallet on chain: a chip allowance you send it, a mandatory stop-loss, round cap and time limit, and every decision logged with its transaction. The wheel keeps its edge; an agent does not change the odds.</p>
          {lastStopped && (
            <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[12px] text-muted dark:bg-surface">
              Last agent <span className="text-ink">{lastStopped.name}</span> stopped: {lastStopped.stoppedReason} Net {lastStopped.net >= 0 ? "+" : ""}{formatNumber(lastStopped.net)} over {lastStopped.roundsPlayed} rounds. <Link href={`/agent/${lastStopped.id}`} className="underline underline-offset-2">Log</Link>
            </p>
          )}
          {lastStopped && stoppedKey && <AgentWalletPanel seatId={lastStopped.id} seat={lastStopped} className="mt-4" />}
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="accent" className="flex-1" href={`/agents/new?table=${encodeURIComponent(tableId)}`}>Program an agent</Button>
            <Button size="sm" variant="ghost" onClick={() => setBuilding(true)}>Quick rules</Button>
          </div>
          <p className="mt-3 text-[11.5px] text-muted">The allowance comes from chips in your wallet ({chips.enabled && !chips.isLoading ? formatNumber(chips.units) : "…"} now), not from chips you have at the table.</p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {mounted && building && !seat && (
          <motion.div key="builder" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AgentBuilder owner={owner} tableId={tableId} balance={chips.units} where="in your wallet" onDone={() => setBuilding(false)} onCancel={() => setBuilding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {mounted && seat && (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-medium">{seat.name}</div>
              <div className="text-[12px] text-muted">{seat.rules.bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label}`).join(" · ")}</div>
            </div>
            <Badge tone={seat.status === "active" ? "accent" : seat.status === "pending-approval" ? "amber" : "muted"}>
              {seat.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
              {seat.status === "pending-approval" ? "Needs approval" : seat.status}
            </Badge>
          </div>

          {legacy && (
            <div className="mt-4 rounded-xl border border-dashed border-border-strong p-3 text-[12.5px]">
              <p>This agent was set up before agents played on chain. It has no wallet and never held funds, so it cannot act here.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => actions.remove(seat.id)}>Discard it</Button>
            </div>
          )}

          {seat.status === "pending-approval" && (
            <div className="mt-4 rounded-xl border border-dashed border-border-strong p-3 text-[12.5px]">
              <p className="mb-2 font-medium">Check in before it goes live</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tnum text-muted">
                <dt>Allowance</dt><dd className="text-right text-ink">{formatNumber(seat.allowance)} chips</dd>
                <dt>Stop-loss</dt><dd className="text-right text-ink">−{formatNumber(seat.rules.stopLoss)}</dd>
                <dt>Stop-win</dt><dd className="text-right text-ink">{seat.rules.stopWin != null ? `+${formatNumber(seat.rules.stopWin)}` : "none"}</dd>
                <dt>Rounds</dt><dd className="text-right text-ink">≤ {seat.rules.maxRounds}</dd>
                <dt>Time limit</dt><dd className="text-right text-ink">{seat.rules.timeLimitMinutes} min</dd>
                <dt>Cadence</dt><dd className="text-right text-ink">{seat.rules.cadence}</dd>
              </dl>
              <ApprovalTerms allowance={seat.allowance} gasPrice={gasPrice} className="mt-3" />
              {funding.error && <p className="mt-2 text-casino-red" role="alert">{funding.error}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="accent" className="flex-1" disabled={funding.busy} onClick={() => void funding.start(seat.id)}>{funding.preparing ? "Preparing…" : seatKey ? "Fund and go live" : "Approve and fund"}</Button>
                <Button size="sm" variant="ghost" disabled={discarding || funding.busy} onClick={() => void discard(seat.id)}>Discard</Button>
              </div>
            </div>
          )}

          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-[12px] tnum">
            <div><dt className="text-muted">Rounds</dt><dd className="font-medium">{seat.roundsPlayed} <span className="text-muted">/ {seat.rules.maxRounds}</span></dd></div>
            <div><dt className="text-muted">Net</dt><dd className={cn("font-medium", seat.net > 0 && "text-ink", seat.net < 0 && "text-casino-red")}>{seat.net >= 0 ? "+" : ""}{formatNumber(seat.net)}</dd></div>
            <div><dt className="text-muted">To stop-loss</dt><dd className="font-medium">{formatNumber(Math.max(0, seat.rules.stopLoss + seat.net))}</dd></div>
          </dl>

          {seatKey && <AgentWalletPanel seatId={seat.id} seat={seat} className="mt-4" />}
          {lastTrace && <AgentDecisionTrace trace={lastTrace} compact className="mt-4" />}
          <AgentLog items={seat.log} max={6} className="mt-3 border-t border-hairline pt-3" />
          {note && <p className="mt-2 text-[12px] text-casino-red" role="alert">{note}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {seat.status === "active" && <Button size="sm" variant="outline" onClick={() => actions.pause(seat.id)}>Pause</Button>}
            {seat.status === "paused" && <Button size="sm" variant="outline" onClick={() => { actions.resume(seat.id); kickAgentRunners(); }}>Resume</Button>}
            {seat.status !== "pending-approval" && !legacy && <Button size="sm" variant="ghost" onClick={() => { actions.stop(seat.id, "Stopped by owner."); kickAgentRunners(); }}>Stop and return funds</Button>}
            <Link href={`/agent/${seat.id}`} className="ml-auto text-[12px] text-muted underline-offset-2 hover:underline">{seat.isPublic ? "Public profile" : "Private log"}</Link>
          </div>
          {seat.status !== "pending-approval" && !legacy && <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{AGENT_TAB_NOTE}</p>}
        </div>
      )}
      <TransactionModal {...funding.modalProps} />
    </div>
  );
}

/** Exactly what approving an on-chain agent does. Shared by the table panel and the builder. */
export function ApprovalTerms({ allowance, gasPrice, className }: { allowance: number; gasPrice: bigint | null; className?: string }) {
  return (
    <div className={cn("text-[12.5px] leading-relaxed", className)}>
      <p className="font-medium text-ink">What approving does</p>
      <ol className="mt-1 list-decimal space-y-1 pl-4 text-muted">
        <li>Creates the agent&apos;s wallet. {AGENT_WALLET_EXPLAINER}</li>
        <li>You sign two transfers from your wallet: {gasFloatLine(gasPrice)}; then {formatNumber(allowance)} chips. That is the hard cap: the agent can never lose more than what you send it.</li>
        <li>The agent then signs for itself, with no wallet prompts: it approves the treasury, moves its chips into its own escrow, and places at most one bet transaction per round under your rules and the table&apos;s live limits.</li>
        <li>When a limit is reached, when gas runs low, or when you press Stop, it leaves the table and sends its chips and unused ETH back to your wallet. &quot;Sweep back to my wallet&quot; does the same at any time.</li>
      </ol>
      <p className="mt-2 text-muted">{AGENT_TAB_NOTE} The wheel keeps 1/37 of every chip bet; an agent follows rules, it does not predict results.</p>
    </div>
  );
}

function AgentBuilder({ owner, tableId, balance, practice, where, onDone, onCancel }: { owner: string; tableId: string; balance: number; practice?: boolean; where?: string; onDone: () => void; onCancel: () => void }) {
  const create = useAgentSeats((s) => s.create);
  const draft = useStable((s) => s.draft);
  const setDraft = useStable((s) => s.setDraft);
  const options = useAgentOptions();
  const inv = options.assets;
  const draftIsStraight = !!draft && draft.betId.startsWith("straight:");
  const [name, setName] = useState(draft?.name ?? "");
  const [thesis, setThesis] = useState("");
  const [betId, setBetId] = useState(draft ? (draftIsStraight ? "straight" : draft.betId) : "red");
  const [straightN, setStraightN] = useState(draftIsStraight ? Number(draft!.betId.split(":")[1]) : 17);
  const [stake, setStake] = useState(draft?.stake ?? 1);
  const [cadence, setCadence] = useState<AgentCadence>((draft?.cadence as AgentCadence) ?? "every");
  const defaultAllowance = Math.max(1, Math.floor(balance * 0.2));
  const [allowance, setAllowance] = useState(defaultAllowance);
  const [stopLoss, setStopLoss] = useState(Math.min(defaultAllowance, draft?.stopLoss ?? Math.max(1, Math.floor(defaultAllowance / 2))));
  const [stopWin, setStopWin] = useState<number | "">(draft?.stopWin ?? "");
  const [maxRounds, setMaxRounds] = useState(draft?.maxRounds ?? 20);
  const [timeLimit, setTimeLimit] = useState(draft?.timeLimitMinutes ?? 30);
  const [primaryAsset, setPrimaryAsset] = useState<string>(inv.find((i) => i.status === "available")?.id ?? "");
  const [fallbackAsset, setFallbackAsset] = useState<string>("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedBet = betId === "straight" ? straight(straightN).id : betId;
  const rules: AgentRules = { bets: [{ betId: resolvedBet, stake }], cadence, maxRounds, stopLoss, stopWin: stopWin === "" ? null : Number(stopWin), timeLimitMinutes: timeLimit };
  const liveError = validateRules(rules, allowance, balance, where);
  const expectedLoss = (stake * maxRounds * 1) / 37;

  const field = "h-9 w-full rounded-lg border border-border bg-transparent px-3 text-[13px] tnum outline-none focus:border-ink";
  const label = "eyebrow mb-1 block text-[10px]";

  return (
    <div className="text-[13px]">
      <label className={label} htmlFor="ag-name">Name</label>
      <input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steady red" className={cn(field, "mb-3")} maxLength={24} />
      <label className={label} htmlFor="ag-thesis">Thesis (public, one line)</label>
      <input id="ag-thesis" value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Small outside bets, walk away on schedule." className={cn(field, "mb-3")} maxLength={120} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="ag-bet">Bet</label>
          <select id="ag-bet" value={betId} onChange={(e) => setBetId(e.target.value)} className={field}>
            {QUICK_BETS.map((b) => <option key={b} value={b}>{OUTSIDE_BETS[b].label}</option>)}
            <option value="straight">Straight number…</option>
          </select>
        </div>
        {betId === "straight" ? (
          <div><label className={label} htmlFor="ag-n">Number</label><input id="ag-n" type="number" min={0} max={36} value={straightN} onChange={(e) => setStraightN(Math.max(0, Math.min(36, Number(e.target.value))))} className={field} /></div>
        ) : (
          <div><label className={label} htmlFor="ag-cad">Cadence</label>
            <select id="ag-cad" value={cadence} onChange={(e) => setCadence(e.target.value as AgentCadence)} className={field}>
              <option value="every">Every round</option><option value="every-other">Every other round</option><option value="after-loss">Only after a loss</option>
            </select></div>
        )}
        <div><label className={label} htmlFor="ag-stake">Stake / round</label><input id="ag-stake" type="number" min={1} value={stake} onChange={(e) => setStake(Math.max(1, Number(e.target.value)))} className={field} /></div>
        <div><label className={label} htmlFor="ag-allow">Allowance{where ? ", from your wallet" : ""} (≤ {Math.floor(balance * AGENT_CAPS.allowanceShareOfBalance)})</label><input id="ag-allow" type="number" min={1} value={allowance} onChange={(e) => setAllowance(Math.max(1, Number(e.target.value)))} className={field} /></div>
        <div><label className={label} htmlFor="ag-sl">Stop-loss (required)</label><input id="ag-sl" type="number" min={1} value={stopLoss} onChange={(e) => setStopLoss(Math.max(1, Number(e.target.value)))} className={field} /></div>
        <div><label className={label} htmlFor="ag-sw">Stop-win (optional)</label><input id="ag-sw" type="number" min={1} value={stopWin} onChange={(e) => setStopWin(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))} className={field} placeholder="—" /></div>
        <div><label className={label} htmlFor="ag-rounds">Max rounds (≤ {AGENT_CAPS.maxRounds})</label><input id="ag-rounds" type="number" min={1} max={AGENT_CAPS.maxRounds} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} className={field} /></div>
        <div><label className={label} htmlFor="ag-time">Time limit, min (≤ {AGENT_CAPS.maxTimeMinutes})</label><input id="ag-time" type="number" min={1} max={AGENT_CAPS.maxTimeMinutes} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} className={field} /></div>
      </div>
      {!practice && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ag-collect">Collect wins as</label>
            <select id="ag-collect" value={primaryAsset} onChange={(e) => setPrimaryAsset(e.target.value)} className={field}>
              <option value="">Win balance (choose later)</option>
              {inv.map((i) => <option key={i.id} value={i.id} disabled={!i.selectable}>{i.symbol} · {i.statusLabel}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ag-fallback">Fallback</label>
            <select id="ag-fallback" value={fallbackAsset} onChange={(e) => setFallbackAsset(e.target.value)} className={field}>
              <option value="">Win balance</option>
              {inv.filter((i) => i.id !== primaryAsset).map((i) => <option key={i.id} value={i.id} disabled={!i.selectable}>{i.symbol} · {i.statusLabel}</option>)}
            </select>
          </div>
          {options.live && !inv.some((i) => i.selectable) && (
            <p className="col-span-2 text-[12px] text-muted">{vaultNote(options)}</p>
          )}
        </div>
      )}
      <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[12px] text-muted dark:bg-surface">
        The wheel keeps 1/37 of every chip bet. At {stake} per round for {maxRounds} rounds the agent is expected to lose about <span className="tnum text-ink">{formatNumber(expectedLoss, { maximumFractionDigits: 1 })} chips</span>. Agents play; they don&apos;t earn.
      </p>
      <label className="mt-3 flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ink)]" />
        Public profile: others can follow this agent and read its rules and log
      </label>
      <p className={cn("mt-3 text-[12px]", liveError ? "text-casino-red" : "text-muted")} role={liveError ? "alert" : undefined}>
        {liveError ?? (practice ? "Practice chips only. Nothing has value." : "The agent is bound by the table's treasury limits and your responsible-play settings.")}
      </p>
      {error && <p className="mt-2 text-[12px] text-casino-red" role="alert">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1" disabled={!!liveError} onClick={() => { const r = create({ name, thesis, collection: { primaryAssetId: primaryAsset || null, fallbackAssetId: fallbackAsset || null }, owner, tableId, rules, allowance, isPublic }); if (!r.ok) setError(r.error); else { setDraft(null); onDone(); } }}>Review</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
