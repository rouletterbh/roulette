/** Operator vocabulary for agent states. Mostly monochrome; green = executing/active. */
export type AgentState =
  | "observing"
  | "waiting"
  | "thinking"
  | "leash-check"
  | "prepared"
  | "executing"
  | "locked"
  | "settling"
  | "collected"
  | "skipped"
  | "paused"
  | "sleeping"
  | "stopped";

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  observing: "Observing table",
  waiting: "Waiting for round",
  thinking: "Thesis matched",
  "leash-check": "Leash check",
  prepared: "Bet prepared",
  executing: "Executing",
  locked: "Round locked",
  settling: "Settling",
  collected: "Collected",
  skipped: "Decision skipped",
  paused: "Paused",
  sleeping: "Sleeping",
  stopped: "Stopped",
};

export const AGENT_STATE_SHORT: Record<AgentState, string> = {
  observing: "Observing",
  waiting: "Waiting",
  thinking: "Matched",
  "leash-check": "Leash",
  prepared: "Prepared",
  executing: "Executing",
  locked: "Locked",
  settling: "Settling",
  collected: "Collected",
  skipped: "Skipped",
  paused: "Paused",
  sleeping: "Sleeping",
  stopped: "Stopped",
};

/** Glyph motion class per state. */
export function glyphMotion(s: AgentState): "idle" | "observing" | "thinking" | "executing" | "settling" | "paused" | "stopped" {
  switch (s) {
    case "observing": case "waiting": return "observing";
    case "thinking": case "leash-check": case "prepared": return "thinking";
    case "executing": case "locked": return "executing";
    case "settling": case "collected": return "settling";
    case "paused": case "sleeping": case "skipped": return "paused";
    case "stopped": return "stopped";
  }
}

export function stateColorVar(s: AgentState): string {
  switch (s) {
    case "executing": case "locked": case "collected": return "var(--agent-executing)";
    case "thinking": case "leash-check": case "prepared": return "var(--agent-thinking)";
    case "settling": return "var(--agent-settling)";
    case "paused": case "sleeping": case "skipped": return "var(--agent-paused)";
    case "stopped": return "var(--agent-stopped)";
    default: return "var(--agent-observing)";
  }
}

/**
 * What an on-chain agent's runner is doing (src/lib/agent-wallet/runner.ts), in the same
 * operator vocabulary. The runner's own sentence is shown next to it; this only picks the
 * indicator. Wallet states that are not a table state (no gas, chain unreachable) read as
 * paused, never as active.
 */
export type ChainRunnerPhase =
  | "idle"
  | "awaiting-funds"
  | "approving"
  | "entering"
  | "observing"
  | "executing"
  | "locked"
  | "paused"
  | "confirming"
  | "waiting-settlement"
  | "leaving"
  | "returning-chips"
  | "returning-gas"
  | "swept"
  | "out-of-gas"
  | "rpc-error";

export function runnerPhaseState(phase: ChainRunnerPhase): AgentState {
  switch (phase) {
    case "idle": return "sleeping";
    case "awaiting-funds": return "waiting";
    case "approving": case "entering": return "prepared";
    case "observing": return "observing";
    case "executing": case "confirming": return "executing";
    case "locked": return "locked";
    case "waiting-settlement": case "leaving": case "returning-chips": case "returning-gas": return "settling";
    case "swept": return "stopped";
    case "paused": case "out-of-gas": case "rpc-error": return "paused";
  }
}

/** Short honest label for the wallet-side states the table vocabulary has no word for. */
export const RUNNER_PHASE_LABEL: Record<ChainRunnerPhase, string> = {
  idle: "Idle",
  "awaiting-funds": "Awaiting funds",
  approving: "Approving treasury",
  entering: "Entering table",
  observing: "Observing table",
  executing: "Executing",
  locked: "Round locked",
  paused: "Paused",
  confirming: "Confirming",
  "waiting-settlement": "Waiting for settlement",
  leaving: "Leaving table",
  "returning-chips": "Returning chips",
  "returning-gas": "Returning gas",
  swept: "Swept",
  "out-of-gas": "Out of gas",
  "rpc-error": "Chain unreachable",
};

export const STRATEGY_CLASSES = ["Adaptive Low Variance", "Momentum", "Conservative", "Contrarian", "Single Number", "Interval"] as const;
export type StrategyClass = (typeof STRATEGY_CLASSES)[number];

/** Short machine id like ARC-7 derived from a name/id string. */
export function agentCode(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const prefixes = ["ARC", "NOVA", "ZERO", "VEGA", "ORBIT", "SEAL", "HALO", "AXIS", "PIVOT", "LUMEN"];
  return `${prefixes[h % prefixes.length]}-${(h >>> 8) % 97 + 1}`;
}
