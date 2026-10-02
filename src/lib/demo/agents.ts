import { demoPlayers, type DemoPlayer } from "./data";
import { mulberry32, hashString } from "./prng";
import { OUTSIDE_BETS, straight } from "@/lib/roulette/bets";
import { rewardRegistry } from "@/config/tokens";

/**
 * DEMO league of agents authored by demo players. Deterministic; nothing here is live.
 * League metrics deliberately never reward money lost or wagered.
 */
export type LeagueCategory = "discipline" | "diversity" | "followers" | "longest-run";

export interface DemoAgent {
  id: string;
  name: string;
  thesis: string;
  owner: DemoPlayer;
  tableId: string;
  bets: Array<{ betId: string; label: string; stake: number }>;
  cadence: "every" | "every-other" | "after-loss";
  stopLoss: number;
  stopWin: number | null;
  maxRounds: number;
  timeLimitMinutes: number;
  status: "active" | "paused" | "stopped";
  /** Rounds completed inside limits in a row (the discipline metric). */
  disciplineStreak: number;
  roundsInsideLimits: number;
  longestRun: number;
  followers: number;
  collection: Array<{ symbol: string; usd: number; count: number }>;
  createdAt: number;
}

const NAMES = ["Steady Red", "Night Column", "Zero Patience", "Quiet Dozen", "Even Keel", "Seventeen", "Low Tide", "Third Act", "Black Coffee", "Odd One", "Corner Shop", "Slow Spin"];
const THESES = [
  "Small outside bets, every round, walk away on schedule.",
  "Only sits down after a loss. Never chases two.",
  "One number, tiny stake, long leash. Collects whatever lands.",
  "Dozens on a timer. Boring on purpose.",
  "Even money, even temper.",
  "Red until the clock says stop.",
];
const TABLES = ["neon-01", "classic", "late-shift"];

export function getDemoAgents(): DemoAgent[] {
  const out: DemoAgent[] = [];
  NAMES.forEach((name, i) => {
    const rnd = mulberry32(hashString(`agent-${name}`));
    const owner = demoPlayers[i % demoPlayers.length];
    const roll = rnd();
    const def = roll < 0.6 ? OUTSIDE_BETS[["red", "black", "odd", "even", "low", "high", "dozen:1", "dozen:2", "column:3"][Math.floor(rnd() * 9)]] : straight(Math.floor(rnd() * 37));
    const stake = [1, 1, 2, 5][Math.floor(rnd() * 4)];
    const assets = rewardRegistry.filter((t) => t.category === "crypto").slice(0, 3);
    const n = 1 + Math.floor(rnd() * 3);
    const collection = assets.slice(0, n).map((a) => ({ symbol: a.symbol, usd: Math.round((2 + rnd() * 40) * 100) / 100, count: 1 + Math.floor(rnd() * 9) }));
    const inside = 20 + Math.floor(rnd() * 400);
    out.push({
      id: `demo-agent-${i + 1}`,
      name,
      thesis: THESES[i % THESES.length],
      owner,
      tableId: TABLES[i % TABLES.length],
      bets: [{ betId: def.id, label: def.label, stake }],
      cadence: (["every", "every-other", "after-loss"] as const)[Math.floor(rnd() * 3)],
      stopLoss: 10 * stake * (1 + Math.floor(rnd() * 4)),
      stopWin: rnd() > 0.5 ? 10 * stake * (2 + Math.floor(rnd() * 4)) : null,
      maxRounds: [20, 50, 100, 200][Math.floor(rnd() * 4)],
      timeLimitMinutes: [30, 60, 120][Math.floor(rnd() * 3)],
      status: rnd() > 0.3 ? "active" : rnd() > 0.5 ? "paused" : "stopped",
      disciplineStreak: Math.floor(rnd() * 60),
      roundsInsideLimits: inside,
      longestRun: 5 + Math.floor(rnd() * 120),
      followers: Math.floor(rnd() * 400),
      collection,
      createdAt: Date.UTC(2026, 8, 1 + Math.floor(rnd() * 30)),
    });
  });
  return out;
}

export function getDemoAgent(id: string) {
  return getDemoAgents().find((a) => a.id === id) ?? null;
}

export const leagueCategories: Record<LeagueCategory, { label: string; hint: string; value: (a: DemoAgent) => number; format: (n: number) => string }> = {
  discipline: { label: "Discipline streak", hint: "Consecutive rounds completed inside limits", value: (a) => a.disciplineStreak, format: (n) => `${n}` },
  diversity: { label: "Collection diversity", hint: "Distinct assets collected", value: (a) => a.collection.length, format: (n) => `${n}` },
  followers: { label: "Most followed", hint: "People following this agent", value: (a) => a.followers, format: (n) => `${n}` },
  "longest-run": { label: "Longest run", hint: "Most rounds in a single approved session", value: (a) => a.longestRun, format: (n) => `${n}` },
};

export function getLeague(category: LeagueCategory) {
  const meta = leagueCategories[category];
  return getDemoAgents()
    .map((a) => ({ agent: a, value: meta.value(a) }))
    .filter((r) => r.value > 0)
    .sort((x, y) => y.value - x.value || x.agent.name.localeCompare(y.agent.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
