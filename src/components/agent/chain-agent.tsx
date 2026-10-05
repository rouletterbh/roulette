"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useAgentSeats, type AgentSeat } from "@/store/agent-seat";
import { useWallet } from "@/store/wallet";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useTxFlow } from "@/lib/web3/use-tx-flow";
import { toTxError } from "@/lib/web3/errors";
import { explorerAddress } from "@/config/chains";
import { siteConfig } from "@/config/site";
import { RUNNER_PHASE_LABEL, runnerPhaseState } from "@/lib/agent/states";
import { AGENT_GAS_FLOAT_WEI, betsCoveredBy, exitReserveWei, formatEth } from "@/lib/agent-wallet/gas";
import { ETH_DUST_WEI, createAgentKey, deleteAgentKey, getAgentKeyInfo, listAgentKeys, readAgentPrivateKey, type AgentKeyInfo } from "@/lib/agent-wallet/keystore";
import { bumpAgentKeys, kickAgentRunners, refreshAgent, requestAgentSweep, responsiblePlayBlock, startAgentRunners, useAgentLive, type AgentLive } from "@/lib/agent-wallet/manager";
import { fundAgent, fundingGap, topUpAgentGas } from "@/lib/agent-wallet/owner-actions";
import { agentIOFor, agentPublicClient } from "@/lib/agent-wallet/signer";
import { TransactionModal } from "@/components/cashier/transaction-modal";
import { Button } from "@/components/ui/button";
import { AgentStatus } from "./agent-status";
import { cn, formatNumber } from "@/lib/utils";

/**
 * UI for agents that play on chain through a burner wallet (demo mode off only).
 * Everything here is client-only and reads browser storage, so nothing key- or
 * balance-dependent renders before mount.
 */

/** What the agent wallet is. Shown wherever the owner approves, funds or manages one. */
export const AGENT_WALLET_EXPLAINER =
  "A burner wallet created in this browser. It holds only the chips and gas you send it. Anyone with access to this browser profile could move them. Clearing site data deletes the key, so sweep first.";

export const AGENT_TAB_NOTE =
  "The agent runs only while this site is open in a tab, and browsers slow background tabs down, so keep the tab visible if you want every round played. Close it and the agent stops acting; its chips stay in its own escrow until you come back and sweep.";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Mounted once (AgentDock): starts the runners for every agent key in this browser. */
export function ChainAgentHost() {
  useEffect(() => startAgentRunners(), []);
  return null;
}

/** Live runner status for a seat (stable object identity between identical polls). */
export function useAgentLiveFor(seatId: string | undefined): AgentLive | undefined {
  return useAgentLive((s) => (seatId ? s.bySeat[seatId] : undefined));
}

/** Address/owner of a seat's key, re-read when keys are created or deleted. Null before mount. */
export function useAgentKey(seatId: string | undefined): AgentKeyInfo | null {
  const mounted = useMounted();
  const version = useAgentLive((s) => s.keysVersion);
  return useMemo(() => {
    void version;
    return mounted && seatId ? getAgentKeyInfo(seatId) : null;
  }, [mounted, seatId, version]);
}

export function useAgentKeys(): AgentKeyInfo[] {
  const mounted = useMounted();
  const version = useAgentLive((s) => s.keysVersion);
  return useMemo(() => {
    void version;
    return mounted ? listAgentKeys() : [];
  }, [mounted, version]);
}

/** Current gas price on Robinhood Chain for the funding estimate; null until read. */
export function useAgentGasPrice(): bigint | null {
  const [price, setPrice] = useState<bigint | null>(null);
  useEffect(() => {
    if (siteConfig.demoMode) return;
    let alive = true;
    const read = () =>
      agentPublicClient()
        .getGasPrice()
        .then((p) => alive && setPrice(p))
        .catch(() => {});
    void read();
    const id = setInterval(read, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return price;
}

/** "about 40 bet transactions at the current gas price" */
export function gasFloatLine(gasPrice: bigint | null): string {
  const float = `${formatEth(AGENT_GAS_FLOAT_WEI)} ETH`;
  if (gasPrice == null) return `${float} for the agent's gas`;
  const n = betsCoveredBy(AGENT_GAS_FLOAT_WEI, gasPrice);
  return n > 0 ? `${float} for the agent's gas: about ${n} bet transactions at the current gas price, plus leaving and sending everything back` : `${float} for the agent's gas (gas is unusually expensive right now: this may not cover a single bet)`;
}

/* ------------------------------------------------------------------ funding */

/**
 * The owner's approval step in chain mode: create the burner key, then fund it through
 * the TransactionModal (gas float, then chips: two signatures). The seat goes live only
 * after funding confirms. Safe to start again after a half-finished attempt.
 */
export function useAgentFunding() {
  const flow = useTxFlow();
  const { open } = flow;
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const start = useCallback(
    async (seatId: string, onFunded?: () => void) => {
      setError(null);
      const seat = useAgentSeats.getState().seats[seatId];
      const owner = useWallet.getState().address;
      if (!seat) return setError("This agent no longer exists.");
      if (!owner) return setError("Connect the wallet that holds your chips first.");
      if (seat.owner.toLowerCase() !== owner.toLowerCase()) return setError("This agent belongs to a different wallet. Connect that wallet to fund it.");
      const block = responsiblePlayBlock();
      if (block) return setError(`${block} Agents follow your responsible-play settings, so this one cannot be funded now.`);
      setPreparing(true);
      try {
        const key = createAgentKey(seatId, owner);
        if (key.owner.toLowerCase() !== owner.toLowerCase()) throw new Error("This agent wallet was created for a different owner wallet.");
        useAgentSeats.getState().attachWallet(seatId, key.address);
        bumpAgentKeys();
        const input = { agent: key.address, allowanceUnits: seat.allowance, gasFloatWei: AGENT_GAS_FLOAT_WEI };
        const [gap, gasPrice] = await Promise.all([fundingGap(input), agentPublicClient().getGasPrice().catch(() => null)]);
        const activate = () => {
          const s = useAgentSeats.getState();
          s.markFunded(seatId);
          if (s.seats[seatId]?.status === "pending-approval") s.approve(seatId);
          kickAgentRunners();
          onFunded?.();
        };
        if (gap.chipsMissing === 0 && gap.ethMissing === 0n) return activate(); // already funded by an earlier attempt
        const signatures = (gap.ethMissing > 0n ? 1 : 0) + (gap.chipsMissing > 0 ? 1 : 0);
        open({
          title: "Fund agent wallet",
          summary: [
            ["Agent wallet", <a key="a" href={explorerAddress(key.address)} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-2">{short(key.address)} ↗</a>],
            ["Chips to send", gap.chipsMissing > 0 ? `${formatNumber(gap.chipsMissing)} chips` : "already there"],
            ["Gas float", gap.ethMissing > 0n ? `${formatEth(gap.ethMissing)} ETH` : "already there"],
            ["Covers", gasPrice != null ? `about ${betsCoveredBy(AGENT_GAS_FLOAT_WEI, gasPrice)} bets + exit` : "estimate unavailable"],
            ["Signatures", signatures === 2 ? "2 · gas, then chips" : "1"],
            ["Hard cap", "the agent can never lose more than this"],
          ],
          run: (report) => fundAgent(input, report),
          onSuccess: activate,
        });
      } catch (e) {
        setError(toTxError(e).message);
      } finally {
        setPreparing(false);
      }
    },
    [open],
  );

  return { start, error, preparing, busy: flow.busy || preparing, modalProps: flow.modalProps };
}

/* ------------------------------------------------------------ wallet panel */

function Figure({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div>
      <dt className="microlabel">{label}</dt>
      <dd className={cn("mt-0.5 font-mono text-[12.5px] tnum", tone === "bad" && "text-casino-red", tone === "warn" && "text-amber")}>{value}</dd>
    </div>
  );
}

/**
 * One agent wallet: address, live chain figures, the runner's own sentence, and the
 * owner's controls (Sweep, Send gas, Export key, Delete key). Works with or without a
 * seat record; everything shown is read from chain by the runner.
 */
export function AgentWalletPanel({ seatId, seat, className, onDeleted }: { seatId: string; seat?: AgentSeat; className?: string; onDeleted?: () => void }) {
  const key = useAgentKey(seatId);
  const live = useAgentLiveFor(seatId);
  const flow = useTxFlow();
  const [exportStage, setExportStage] = useState<"closed" | "confirm" | "shown">("closed");
  const [secret, setSecret] = useState<Hex | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Balances for a wallet that is not being driven right now (stopped and swept, or seat-less).
  useEffect(() => {
    if (key) refreshAgent(seatId);
  }, [key, seatId]);

  const closeExport = useCallback(() => {
    setSecret(null);
    setCopied(false);
    setExportStage("closed");
  }, []);

  if (!key) return null;
  const snap = live?.snapshot ?? null;
  const phase = live?.phase ?? "idle";
  const pending = seat?.chain?.pending ?? null;
  const holdsSomething = !!snap && (snap.chipUnits > 0 || snap.escrow > 0n || snap.eth > ETH_DUST_WEI);
  const lowGas = !!snap && snap.eth < exitReserveWei(snap.gasPrice) && (snap.chipUnits > 0 || snap.escrow > 0n);

  const sweep = () => {
    setMessage(null);
    if (!requestAgentSweep(seatId)) setMessage("The agent wallet could not be opened in this browser.");
  };

  const sendGas = () => {
    const value = snap ? exitReserveWei(snap.gasPrice) * 2n : AGENT_GAS_FLOAT_WEI / 10n;
    flow.open({
      title: "Send gas to the agent wallet",
      summary: [
        ["Agent wallet", <span key="a" className="font-mono">{short(key.address)}</span>],
        ["Amount", `${formatEth(value)} ETH`],
        ["Purpose", "lets the agent leave the table and send everything back"],
      ],
      run: (report) => topUpAgentGas(key.address, value, report),
      onSuccess: () => {
        refreshAgent(seatId);
        kickAgentRunners();
      },
    });
  };

  const remove = async () => {
    setWorking(true);
    setMessage(null);
    try {
      // A fresh chain read decides; a figure from a few seconds ago is not good enough to throw a key away.
      const fresh = await agentIOFor(seatId)?.snapshot().catch(() => null);
      const result = deleteAgentKey(seatId, fresh ? { chipUnits: fresh.chipUnits, escrow: fresh.escrow, winBalance: fresh.winBalance, eth: fresh.eth } : null);
      if (!result.ok) return setMessage(result.reason);
      setConfirmDelete(false);
      bumpAgentKeys();
      onDeleted?.();
    } finally {
      setWorking(false);
    }
  };

  const reveal = () => {
    setSecret(readAgentPrivateKey(seatId));
    setExportStage("shown");
  };

  return (
    <div className={cn("border-t border-ink pt-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="microlabel !text-ink">Agent wallet</span>
        <a href={explorerAddress(key.address)} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-muted underline-offset-2 hover:text-ink hover:underline" title={key.address}>
          {short(key.address)} ↗
        </a>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="min-w-0 text-[12.5px] leading-snug text-ink-2" aria-live="polite">
          {live?.elsewhere ? "This agent is being run by another tab of this browser. This tab only watches." : live?.note || (snap ? "Idle." : "Reading the agent wallet from Robinhood Chain…")}
        </p>
        <span className="shrink-0">
          <AgentStatus state={runnerPhaseState(phase)} className="whitespace-nowrap" />
          <span className="sr-only">{RUNNER_PHASE_LABEL[phase]}</span>
        </span>
      </div>
      {live?.error && (
        <p className="mt-1 text-[12px] text-casino-red" role="alert">
          {phase === "out-of-gas" ? "Out of gas: " : phase === "rpc-error" ? "Chain read failed: " : ""}
          {live.error}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Figure label="Chips in wallet" value={snap ? formatNumber(snap.chipUnits) : "—"} />
        <Figure label="In escrow" value={snap ? formatNumber(Number(snap.escrow)) : "—"} />
        <Figure label="In this round" value={pending ? `${formatNumber(pending.wager)} · #${pending.roundId}` : "0"} />
        <Figure label="Gas left" value={snap ? `${formatEth(snap.eth)} ETH` : "—"} tone={lowGas ? "warn" : undefined} />
        {seat && <Figure label="Net vs allowance" value={`${seat.net >= 0 ? "+" : ""}${formatNumber(seat.net)} / ${formatNumber(seat.allowance)}`} tone={seat.net < 0 ? "bad" : undefined} />}
        {seat?.chain?.sweptAt ? <Figure label="Swept" value="everything returned" /> : <Figure label="Returns to" value={<span title={key.owner}>{short(key.owner)}</span>} />}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!snap || !holdsSomething || live?.elsewhere} onClick={sweep}>Sweep back to my wallet</Button>
        {(phase === "out-of-gas" || lowGas) && <Button size="sm" variant="outline" disabled={flow.busy} onClick={sendGas}>Send gas</Button>}
        <Button size="sm" variant="ghost" onClick={() => (exportStage === "closed" ? setExportStage("confirm") : closeExport())}>{exportStage === "closed" ? "Export key" : "Hide key"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setMessage(null); setConfirmDelete((v) => !v); }}>Delete key</Button>
      </div>

      {exportStage === "confirm" && (
        <div className="mt-3 border border-dashed border-border-strong p-3 text-[12.5px]" role="alertdialog" aria-label="Export agent key">
          <p>The private key controls everything this agent wallet holds. Anyone who sees it can move those chips and that ETH. Only reveal it to recover funds in another wallet, with nobody watching your screen.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" onClick={reveal}>Reveal private key</Button>
            <Button size="sm" variant="ghost" onClick={closeExport}>Cancel</Button>
          </div>
        </div>
      )}
      {exportStage === "shown" && (
        <div className="mt-3 border border-dashed border-border-strong p-3 text-[12.5px]">
          <label className="microlabel mb-1 block" htmlFor={`key-${seatId}`}>Private key for {short(key.address)}</label>
          <input id={`key-${seatId}`} readOnly value={secret ?? "The key could not be read from this browser."} onFocus={(e) => e.currentTarget.select()} className="h-9 w-full border-b border-border bg-transparent font-mono text-[11.5px] outline-none focus:border-ink" autoComplete="off" spellCheck={false} />
          <div className="mt-2 flex gap-2">
            {secret && <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(secret).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</Button>}
            <Button size="sm" variant="ghost" onClick={closeExport}>Hide</Button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="mt-3 border border-dashed border-border-strong p-3 text-[12.5px]" role="alertdialog" aria-label="Delete agent key">
          <p>Deleting the key is permanent. It is refused while the address still holds chips, escrow, a win balance or more ETH than dust. Sweep first; export the key if you want a backup.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" disabled={working} onClick={() => void remove()}>{working ? "Checking balances…" : "Delete key"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {message && <p className="mt-2 text-[12px] text-casino-red" role="alert">{message}</p>}
      <TransactionModal {...flow.modalProps} />
    </div>
  );
}

/* ------------------------------------------------------------ wallets list */

/** Every agent wallet kept in this browser, including ones whose agent record is gone. */
export function AgentWalletsList({ className }: { className?: string }) {
  const mounted = useMounted();
  const keys = useAgentKeys();
  const seats = useAgentSeats((s) => s.seats);
  if (!mounted) return <div className={cn("min-h-[80px]", className)} aria-busy="true" />;
  if (keys.length === 0) return <p className={cn("max-w-xl text-[13.5px] text-muted", className)}>No agent wallet is kept in this browser. One is created when you approve and fund an agent.</p>;
  return (
    <div className={className}>
      <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-muted">{AGENT_WALLET_EXPLAINER} {AGENT_TAB_NOTE}</p>
      <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {keys.map((k) => {
          const seat = seats[k.seatId];
          return (
            <li key={k.seatId}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium">{seat ? seat.name : "Wallet without an agent record"}</span>
                <span className="microlabel">{seat ? `${seat.code} · ${seat.status === "pending-approval" ? "not approved" : seat.status}` : "record cleared"}</span>
              </div>
              <AgentWalletPanel seatId={k.seatId} seat={seat} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
