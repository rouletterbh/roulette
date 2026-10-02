"use client";

import { create } from "zustand";
import { getDemoAgents, type DemoAgent } from "@/lib/demo/agents";
import { mulberry32, hashString } from "@/lib/demo/prng";
import { colorOf } from "@/lib/roulette/constants";
import { agentCode, type AgentState, STRATEGY_CLASSES, type StrategyClass } from "@/lib/agent/states";

/**
 * DEMO agent network telemetry. A scripted loop per agent moves through
 * observing → thesis matched → leash check → bet prepared → round locked →
 * result → collected / skipped, emitting compact telemetry events. Results use
 * a seeded PRNG for ambience only; nothing here is live or outcome-bearing.
 */
export type TelemetryKind = "observe" | "match" | "leash" | "prepare" | "lock" | "result" | "collect" | "skip" | "stop" | "pause" | "resume" | "wake" | "system";

export interface TelemetryEvent {
  id: string;
  at: number;
  kind: TelemetryKind;
  agentId: string | null;
  code: string;
  tableId: string;
  roundId: number;
  text: string;
  delta?: number;
}

export interface NetAgent {
  id: string;
  code: string;
  name: string;
  strategyClass: StrategyClass;
  tableId: string;
  state: AgentState;
  stepAt: number;
  rounds: number;
  decisions: number;
  skips: number;
  leash: { chips: number; chipsMax: number; loss: number; lossMax: number; rounds: number; roundsMax: number; minutes: number; minutesMax: number };
  lastBet: { label: string; stake: number } | null;
  lastDelta: number | null;
  demo: DemoAgent;
}

export interface TableRound {
  tableId: string;
  roundId: number;
  phase: "open" | "locked" | "settling";
  nextAt: number;
  recent: number[];
  exposurePct: number;
}

export interface NetworkSummary { active: number; observing: number; executing: number; paused: number; settling: number; stopped: number }

export function summarize(a: NetAgent[]): NetworkSummary {
  const by = (f: (s: AgentState) => boolean) => a.filter((x) => f(x.state)).length;
  return {
    active: by((s) => s !== "paused" && s !== "sleeping" && s !== "stopped"),
    observing: by((s) => s === "observing" || s === "waiting"),
    executing: by((s) => s === "thinking" || s === "leash-check" || s === "prepared" || s === "executing" || s === "locked"),
    paused: by((s) => s === "paused" || s === "sleeping"),
    settling: by((s) => s === "settling" || s === "collected"),
    stopped: by((s) => s === "stopped"),
  };
}

const EMPTY_SUMMARY: NetworkSummary = { active: 0, observing: 0, executing: 0, paused: 0, settling: 0, stopped: 0 };

interface NetworkState {
  started: boolean;
  agents: NetAgent[];
  /** Cached; recomputed only when agents change. Stable reference for selectors. */
  summaryCache: NetworkSummary;
  tables: Record<string, TableRound>;
  events: TelemetryEvent[];
  totals: { decisions: number; skips: number; collections: number };
  start: () => void;
  tick: () => void;
  /** Returns the cached summary (stable reference). Safe to use inside selectors. */
  summary: () => NetworkSummary;
}

const TABLES = ["neon-01", "classic", "late-shift"];
const ROUND_MS: Record<string, number> = { "neon-01": 20_000, classic: 35_000, "late-shift": 12_000 };
let seq = 0;
const eid = () => `t${(seq++).toString(36)}`;
const ev = (kind: TelemetryKind, a: Pick<NetAgent, "id" | "code" | "tableId"> | null, tableId: string, roundId: number, text: string, delta?: number): TelemetryEvent => ({
  id: eid(), at: Date.now(), kind, agentId: a?.id ?? null, code: a?.code ?? "TABLE", tableId, roundId, text, delta,
});

const rnd = mulberry32(hashString("agent-network"));

function initAgents(): NetAgent[] {
  return getDemoAgents().map((d, i) => {
    const r = mulberry32(hashString(d.id));
    const chipsMax = d.stopLoss * 4;
    return {
      id: d.id,
      code: agentCode(d.id),
      name: d.name,
      strategyClass: STRATEGY_CLASSES[i % STRATEGY_CLASSES.length],
      tableId: d.tableId,
      state: d.status === "active" ? "observing" : d.status === "paused" ? "paused" : "sleeping",
      stepAt: Date.now() + r() * 6000,
      rounds: Math.floor(d.roundsInsideLimits * 0.3),
      decisions: Math.floor(d.roundsInsideLimits * 0.2),
      skips: Math.floor(d.roundsInsideLimits * 0.1),
      leash: { chips: Math.floor(chipsMax * (0.3 + r() * 0.5)), chipsMax, loss: Math.floor(d.stopLoss * r() * 0.6), lossMax: d.stopLoss, rounds: Math.floor(d.maxRounds * r() * 0.6), roundsMax: d.maxRounds, minutes: Math.floor(d.timeLimitMinutes * r() * 0.5), minutesMax: d.timeLimitMinutes },
      lastBet: null,
      lastDelta: null,
      demo: d,
    };
  });
}

function initTables(): Record<string, TableRound> {
  const now = Date.now();
  return Object.fromEntries(
    TABLES.map((t, i) => [t, { tableId: t, roundId: 4800 + i * 7 + Math.floor(rnd() * 20), phase: "open" as const, nextAt: now + ROUND_MS[t] * (0.3 + rnd() * 0.7), recent: Array.from({ length: 8 }, () => Math.floor(rnd() * 37)), exposurePct: 8 + rnd() * 10 }]),
  );
}

export const useAgentNetwork = create<NetworkState>()((set, get) => ({
  started: false,
  agents: [],
  summaryCache: EMPTY_SUMMARY,
  tables: {},
  events: [],
  totals: { decisions: 1821, skips: 348, collections: 12 },
  start: () => {
    if (get().started) return;
    const agents = initAgents();
    const tables = initTables();
    set({ started: true, agents, summaryCache: summarize(agents), tables, events: [ev("system", null, "neon-01", tables["neon-01"].roundId, "Agent network online. Demo telemetry.")] });
  },
  summary: () => get().summaryCache,
  tick: () => {
    const s = get();
    if (!s.started) return;
    const now = Date.now();
    const events: TelemetryEvent[] = [];
    const tables = { ...s.tables };
    const totals = { ...s.totals };

    // table rounds
    for (const t of Object.values(tables)) {
      if (t.phase === "open" && now >= t.nextAt) {
        tables[t.tableId] = { ...t, phase: "locked", nextAt: now + 8_500 };
        events.push(ev("lock", null, t.tableId, t.roundId, `Round #${t.roundId} locked. Commitment fixed.`));
      } else if (t.phase === "locked" && now >= t.nextAt) {
        const result = Math.floor(rnd() * 37);
        tables[t.tableId] = { ...t, phase: "settling", nextAt: now + 4_000, recent: [result, ...t.recent].slice(0, 12) };
        events.push(ev("result", null, t.tableId, t.roundId, `Round #${t.roundId} result: ${result} ${colorOf(result).toUpperCase()}.`));
      } else if (t.phase === "settling" && now >= t.nextAt) {
        tables[t.tableId] = { ...t, phase: "open", roundId: t.roundId + 1, nextAt: now + ROUND_MS[t.tableId], exposurePct: Math.max(3, Math.min(24, t.exposurePct + (rnd() - 0.5) * 4)) };
      }
    }

    const agents = s.agents.map((a) => {
      if (now < a.stepAt) return a;
      const t = tables[a.tableId];
      const r = rnd();
      const next = { ...a, leash: { ...a.leash } };
      const step = (state: AgentState, ms: number) => { next.state = state; next.stepAt = now + ms; };
      switch (a.state) {
        case "sleeping":
          if (r < 0.05) { step("observing", 4000); events.push(ev("wake", a, a.tableId, t.roundId, "Agent online. Watching table.")); } else next.stepAt = now + 8000;
          break;
        case "paused":
          if (r < 0.04) { step("observing", 4000); events.push(ev("resume", a, a.tableId, t.roundId, "Resumed by owner.")); } else next.stepAt = now + 8000;
          break;
        case "observing": {
          if (t.phase !== "open") { step("waiting", 2500); break; }
          const recent = t.recent.slice(0, 5).map((n) => (n === 0 ? "G" : colorOf(n) === "red" ? "R" : "B"));
          if (r < 0.55) {
            step("thinking", 1400);
            events.push(ev("match", a, a.tableId, t.roundId, `Observed ${recent.join(" ")}. Thesis condition met.`));
          } else {
            next.skips += 1; totals.skips += 1;
            step("skipped", 3500);
            events.push(ev("skip", a, a.tableId, t.roundId, `Observed ${recent.join(" ")}. Condition not met. Skipped.`));
          }
          break;
        }
        case "waiting":
          if (t.phase === "open") step("observing", 1200); else next.stepAt = now + 1500;
          break;
        case "skipped":
          step("observing", 2000);
          break;
        case "thinking": {
          const nearLimit = next.leash.loss >= next.leash.lossMax * 0.9 || next.leash.rounds >= next.leash.roundsMax;
          if (nearLimit && r < 0.5) {
            step("stopped", 60_000);
            events.push(ev("stop", a, a.tableId, t.roundId, next.leash.rounds >= next.leash.roundsMax ? "Round cap reached. Agent stopped itself." : "Stop loss hit. Agent stopped itself."));
          } else {
            step("leash-check", 900);
            events.push(ev("leash", a, a.tableId, t.roundId, `Leash check passed. ${Math.max(0, next.leash.lossMax - next.leash.loss)} chips to stop loss.`));
          }
          break;
        }
        case "leash-check": {
          const bet = a.demo.bets[0];
          next.lastBet = { label: bet.label, stake: bet.stake };
          step("prepared", 1200);
          events.push(ev("prepare", a, a.tableId, t.roundId, `Bet prepared: ${bet.stake} on ${bet.label}.`));
          break;
        }
        case "prepared":
          if (t.phase === "open") {
            step("executing", 1500);
            next.decisions += 1; totals.decisions += 1;
            events.push(ev("prepare", a, a.tableId, t.roundId, `Placed ${a.lastBet?.stake ?? 1} chips on ${a.lastBet?.label ?? "the table"}.`));
          } else { step("waiting", 1500); }
          break;
        case "executing":
          step("locked", Math.max(1000, t.nextAt - now + 500));
          break;
        case "locked":
          if (t.phase === "settling" || t.phase === "open") {
            step("settling", 1500);
          } else next.stepAt = now + 800;
          break;
        case "settling": {
          const won = r < 0.46;
          const stake = a.lastBet?.stake ?? 1;
          const delta = won ? stake : -stake;
          next.lastDelta = delta;
          next.rounds += 1;
          next.leash.rounds += 1;
          next.leash.chips = Math.max(0, next.leash.chips + delta);
          next.leash.loss = Math.max(0, next.leash.loss - delta);
          next.leash.minutes = Math.min(next.leash.minutesMax, next.leash.minutes + 0.3);
          if (won) { totals.collections += 1; step("collected", 2500); events.push(ev("collect", a, a.tableId, t.roundId, `Collected +${delta} chips → ${a.demo.collection[0]?.symbol ?? "win balance"}.`, delta)); }
          else { step("observing", 2500); events.push(ev("result", a, a.tableId, t.roundId, `Settlement complete. −${stake} chips.`, delta)); }
          break;
        }
        case "collected":
          step("observing", 1500);
          break;
        case "stopped":
          next.stepAt = now + 60_000;
          break;
      }
      return next;
    });

    const changed = agents.some((a, i) => a !== s.agents[i]);
    if (events.length || changed) set({ agents, summaryCache: changed ? summarize(agents) : s.summaryCache, tables, totals, events: [...s.events, ...events].slice(-120) });
  },
}));
