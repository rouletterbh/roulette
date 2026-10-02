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

export const STRATEGY_CLASSES = ["Adaptive Low Variance", "Momentum", "Conservative", "Contrarian", "Single Number", "Interval"] as const;
export type StrategyClass = (typeof STRATEGY_CLASSES)[number];

/** Short machine id like ARC-7 derived from a name/id string. */
export function agentCode(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const prefixes = ["ARC", "NOVA", "ZERO", "VEGA", "ORBIT", "SEAL", "HALO", "AXIS", "PIVOT", "LUMEN"];
  return `${prefixes[h % prefixes.length]}-${(h >>> 8) % 97 + 1}`;
}
