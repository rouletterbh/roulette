"use client";

import { create } from "zustand";
import { useAgentSeats } from "@/store/agent-seat";
import { evaluateGate, readPlayedTodayMs, useResponsibleStore } from "@/store/responsible";
import { BETTING_WINDOW_SECONDS, CHAIN_POLL_MS, resolveChainTableId } from "@/lib/web3/contracts";
import { AgentRunner, type RunnerStatus } from "./runner";
import { agentIOFor } from "./signer";
import { listAgentKeys, type AgentKeyInfo } from "./keystore";
import { orphanSeatPort, storeSeatPort } from "./seat-port";

/**
 * Runs the on-chain agents of this browser tab. One AgentRunner per agent key; a
 * single interval ticks them on the page's polling cadence. Live figures go to a
 * small non-persisted store that UI reads by seat id.
 *
 * Only one tab drives a given agent: each runner holds a Web Lock named after the
 * seat for as long as the tab lives, so a second tab shows "running in another tab"
 * instead of signing with the same key.
 */
export interface AgentLive extends RunnerStatus {
  address: `0x${string}`;
  owner: `0x${string}`;
  /** Another tab of this browser holds the agent. */
  elsewhere: boolean;
}

interface LiveState {
  bySeat: Record<string, AgentLive>;
  /** Bumped whenever keys are created or deleted, so key lists re-read storage. */
  keysVersion: number;
}

export const useAgentLive = create<LiveState>()(() => ({ bySeat: {}, keysVersion: 0 }));

export function bumpAgentKeys() {
  useAgentLive.setState((s) => ({ keysVersion: s.keysVersion + 1 }));
}

/**
 * The owner's responsible-play controls (self-exclusion, account lock, cooldown, daily time
 * limit) bind their agents too: while one is active no agent may be funded, and a running
 * agent is stopped, which makes it leave the table and return its funds.
 */
export function responsiblePlayBlock(now = Date.now()): string | null {
  if (!useResponsibleStore.persist?.hasHydrated?.()) return null;
  const gate = evaluateGate(useResponsibleStore.getState(), readPlayedTodayMs(), now);
  return gate.blocked ? (gate.reason ?? "A responsible-play control is active.") : null;
}

interface Entry {
  key: AgentKeyInfo;
  runner: AgentRunner;
  locked: boolean;
  lockPending: boolean;
  /** The last attempt found another tab holding the agent. */
  lockDenied: boolean;
  release: (() => void) | null;
  nextAt: number;
  failures: number;
  /** A swept, stopped seat is read once for display and then left alone. */
  parked: boolean;
}

const entries = new Map<string, Entry>();
let stopTicker: (() => void) | null = null;
let users = 0;

function sameStatus(a: AgentLive | undefined, b: AgentLive): boolean {
  if (!a) return false;
  const sa = a.snapshot, sb = b.snapshot;
  const snapEq = sa === sb || (!!sa && !!sb && sa.chipUnits === sb.chipUnits && sa.escrow === sb.escrow && sa.eth === sb.eth && sa.approved === sb.approved && sa.winBalance === sb.winBalance && sa.gasPrice === sb.gasPrice);
  return snapEq && a.phase === b.phase && a.note === b.note && a.error === b.error && a.roundId === b.roundId && a.elsewhere === b.elsewhere;
}

function publish(seatId: string, key: AgentKeyInfo, status: RunnerStatus, elsewhere: boolean) {
  const next: AgentLive = { ...status, address: key.address, owner: key.owner, elsewhere };
  const prev = useAgentLive.getState().bySeat[seatId];
  if (sameStatus(prev, next)) return; // identical figures: keep the object identity so nothing re-renders
  useAgentLive.setState((s) => ({ bySeat: { ...s.bySeat, [seatId]: next } }));
}

function acquire(seatId: string, e: Entry) {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) {
    e.locked = true; // no Web Locks: single-tab use is assumed
    return;
  }
  if (e.lockPending) return;
  e.lockPending = true;
  void locks
    .request(`agent-wallet:${seatId}`, { ifAvailable: true }, (lock) => {
      e.lockPending = false;
      e.lockDenied = !lock;
      if (!lock) return undefined;
      e.locked = true;
      void drive(seatId, e);
      return new Promise<void>((resolve) => {
        e.release = resolve;
      });
    })
    .catch(() => {
      e.lockPending = false;
    });
}

function ensure(key: AgentKeyInfo): Entry | null {
  const existing = entries.get(key.seatId);
  if (existing) return existing;
  const io = agentIOFor(key.seatId);
  if (!io) return null;
  const seat = useAgentSeats.getState().seats[key.seatId];
  const entry: Entry = {
    key,
    runner: new AgentRunner({
      io,
      owner: key.owner,
      seat: seat ? storeSeatPort(key.seatId) : orphanSeatPort(),
      tableId: resolveChainTableId(seat?.tableId),
      bettingWindowSeconds: BETTING_WINDOW_SECONDS,
      onStatus: (s) => publish(key.seatId, key, s, false),
    }),
    locked: false,
    lockPending: false,
    lockDenied: false,
    release: null,
    nextAt: 0,
    failures: 0,
    parked: false,
  };
  entries.set(key.seatId, entry);
  return entry;
}

async function drive(seatId: string, e: Entry) {
  const seat = useAgentSeats.getState().seats[seatId];
  if (e.parked && !e.runner.sweeping && (!seat || (seat.status === "stopped" && seat.chain?.sweptAt))) return;
  if (!e.locked) {
    acquire(seatId, e);
    if (!e.locked) {
      if (e.lockDenied) publish(seatId, e.key, e.runner.getStatus(), true);
      return;
    }
  }
  if (Date.now() < e.nextAt) return;
  if (seat && (seat.status === "active" || seat.status === "paused")) {
    const block = responsiblePlayBlock();
    if (block) useAgentSeats.getState().stop(seatId, `Stopped by your responsible-play settings: ${block}`);
  }
  // A key whose seat record is gone is never acted on by itself: balances are shown, and the
  // owner decides (Sweep). Everything else follows the seat's status.
  if (!seat && !e.runner.sweeping) {
    await e.runner.peek();
    e.parked = !!e.runner.getStatus().snapshot;
    return;
  }
  for (let i = 0; i < 6; i++) {
    const { again } = await e.runner.tick();
    const status = e.runner.getStatus();
    if (status.phase === "rpc-error") {
      e.failures += 1;
      e.nextAt = Date.now() + Math.min(30_000, CHAIN_POLL_MS * e.failures); // back off, keep trying
    } else {
      e.failures = 0;
      e.nextAt = 0;
    }
    e.parked = status.phase === "swept";
    if (!again) break;
  }
}

function tickAll() {
  const keys = listAgentKeys();
  for (const key of keys) {
    const e = ensure(key);
    if (e) void drive(key.seatId, e);
  }
  // Keys deleted since the last pass: let go of their runners and locks.
  for (const [seatId, e] of entries) {
    if (!keys.some((k) => k.seatId === seatId)) {
      e.release?.();
      entries.delete(seatId);
      useAgentLive.setState((s) => {
        const { [seatId]: _gone, ...rest } = s.bySeat;
        void _gone;
        return { bySeat: rest };
      });
    }
  }
}

/**
 * A steady tick. Browsers slow `setInterval` down in background tabs (to once a minute after
 * a while), which would make an agent sit out most rounds, so the beat comes from a tiny
 * dedicated worker where one can be created, and from a plain interval otherwise. The agent's
 * safety never depends on the beat: a late tick only means a skipped round.
 */
function startTicker(fn: () => void, ms: number): () => void {
  let stop: () => void = () => {};
  const interval = () => {
    const id = setInterval(fn, ms);
    stop = () => clearInterval(id);
  };
  try {
    if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") throw new Error("no worker");
    const url = URL.createObjectURL(new Blob([`setInterval(function(){postMessage(0)},${ms})`], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = () => fn();
    worker.onerror = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      interval(); // e.g. a content-security policy that forbids blob workers
    };
    stop = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    interval();
  }
  return () => stop();
}

/** Start ticking (idempotent, reference counted). Returns the matching stop. */
export function startAgentRunners(): () => void {
  users += 1;
  if (!stopTicker) {
    tickAll();
    stopTicker = startTicker(tickAll, CHAIN_POLL_MS);
  }
  return () => {
    users -= 1;
    if (users > 0 || !stopTicker) return;
    stopTicker();
    stopTicker = null;
  };
}

/** Run the runners now instead of at the next interval (after funding, Stop, Sweep). */
export function kickAgentRunners() {
  for (const e of entries.values()) e.nextAt = 0;
  tickAll();
}

/** Owner asked for everything back. Works for stopped, half-funded and seat-less keys alike. */
export function requestAgentSweep(seatId: string): boolean {
  const key = listAgentKeys().find((k) => k.seatId === seatId);
  const e = key ? ensure(key) : null;
  if (!e) return false;
  e.parked = false;
  e.nextAt = 0;
  e.runner.requestSweep();
  void drive(seatId, e);
  return true;
}

/** Re-read one agent's balances for display (does not send anything unless the seat itself calls for it). */
export function refreshAgent(seatId: string) {
  const e = entries.get(seatId);
  if (!e) return tickAll();
  e.parked = false;
  e.nextAt = 0;
  void drive(seatId, e);
}
