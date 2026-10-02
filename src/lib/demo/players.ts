import { demoPlayers, demoTables, type DemoPlayer } from "./data";
import { OUTSIDE_BETS, straight, type BetDefinition, type PlacedBet } from "@/lib/roulette/bets";
import { settleBets } from "@/lib/roulette/settle";
import type { AchievementId } from "@/config/achievements";
import { shortAddress } from "@/lib/utils";

/**
 * DEMO MODE player dataset.
 *
 * Everything here is derived deterministically from the wallet string, so the
 * same wallet always yields the same history on the server and the client
 * (no Math.random at render, no hydration drift). Label it DEMO in the UI.
 */

/** Fixed "now" so relative times and period windows are stable across renders. */
export const demoNow = Date.UTC(2026, 9, 2, 17, 30, 0);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface DemoRound {
  roundId: number;
  at: number;
  tableId: string;
  tableName: string;
  bets: Array<{ id: string; label: string; stake: number; won: boolean }>;
  /** Compact text, e.g. "Red 10 · 17 straight 2". */
  betsSummary: string;
  wagered: number;
  returned: number;
  result: number;
  net: number;
  won: boolean;
}

export interface EarnedAchievement {
  id: AchievementId;
  earnedAt: number;
}

export interface PlayerProfile {
  wallet: string;
  /** ENS or chosen name when known, otherwise null. */
  name: string | null;
  /** Always printable: name, else shortened wallet. */
  displayName: string;
  joinedAt: number;
  games: number;
  wins: number;
  largestWin: number;
  favoriteBet: string;
  totalWagered: number;
  currentStreak: number;
  bestStreak: number;
  hostedTables: number;
  achievements: EarnedAchievement[];
}

export type LeaderboardPeriod = "today" | "week" | "all";
export type LeaderboardCategory = "biggest-win" | "most-games" | "longest-streak";

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  displayName: string;
  value: number;
  /** Formatted value for the table cell. */
  valueLabel: string;
  /** Context line, e.g. the bet that produced the win. */
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

export function hashWallet(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];

/* ------------------------------------------------------------------ */
/* Bet pool                                                            */
/* ------------------------------------------------------------------ */

const outsidePool: BetDefinition[] = Object.values(OUTSIDE_BETS);
const stakePool = [1, 1, 1, 5, 5, 5, 10, 10, 25] as const;

function betLabel(b: BetDefinition) {
  return b.kind === "straight" ? `${b.numbers[0]} straight` : b.label;
}

/* ------------------------------------------------------------------ */
/* History generation                                                  */
/* ------------------------------------------------------------------ */

const liveTables = demoTables.filter((t) => t.status === "live");

function generateHistory(p: DemoPlayer): DemoRound[] {
  const seed = hashWallet(p.wallet);
  const rng = mulberry32(seed);
  const count = Math.max(40, Math.min(p.games, 72));
  const favorites = [Math.floor(rng() * 37), Math.floor(rng() * 37), Math.floor(rng() * 37)];
  const hosts = p.name === "tablehost" || p.name === "marlowe.eth";

  // Timestamps walk backwards from demoNow with occasional multi-hour and day gaps.
  const times: number[] = [];
  let t = demoNow - Math.floor(rng() * 40) * 60_000;
  for (let i = 0; i < count; i++) {
    times.push(t);
    const r = rng();
    const gap = r < 0.55 ? 3 + rng() * 40 : r < 0.85 ? 60 + rng() * 300 : 10 * 60 + rng() * 30 * 60;
    t -= Math.round(gap) * 60_000;
  }
  times.reverse(); // chronological

  const rounds: DemoRound[] = [];
  let roundId = 40_000 + (seed % 9_000);
  for (let i = 0; i < count; i++) {
    roundId += 1 + Math.floor(rng() * 37);
    const table = hosts && rng() < 0.18 ? { id: `private-${p.name}`, name: `${p.name.toUpperCase()} ROOM`, maxBet: 25 } : pick(rng, liveTables);

    const nBets = rng() < 0.6 ? 1 : rng() < 0.75 ? 2 : 3;
    const chosen: PlacedBet[] = [];
    for (let b = 0; b < nBets; b++) {
      const def = rng() < 0.3 ? straight(pick(rng, favorites)) : pick(rng, outsidePool);
      if (chosen.some((c) => c.id === def.id)) continue;
      const stake = Math.min(pick(rng, stakePool), table.maxBet);
      chosen.push({ ...def, stake });
    }

    let result = Math.floor(rng() * 37);
    // The tail of the history is shaped to match the player's published current streak.
    const fromEnd = count - 1 - i;
    if (fromEnd < p.streak) {
      result = chosen[0].numbers[Math.floor(rng() * chosen[0].numbers.length)];
    } else if (fromEnd === p.streak) {
      const covered = new Set(chosen.flatMap((c) => c.numbers));
      let guard = 0;
      while (covered.has(result) && guard++ < 50) result = Math.floor(rng() * 37);
    }

    const s = settleBets(chosen, result);
    rounds.push({
      roundId,
      at: times[i],
      tableId: table.id,
      tableName: table.name,
      bets: s.lines.map((l, idx) => ({ id: chosen[idx].id, label: betLabel(chosen[idx]), stake: l.stake, won: l.won })),
      betsSummary: chosen.map((c) => `${betLabel(c)} ${c.stake}`).join(" · "),
      wagered: s.totalStaked,
      returned: s.totalReturned,
      result,
      net: s.netProfit,
      won: s.netProfit > 0,
    });
  }
  return rounds;
}

/* ------------------------------------------------------------------ */
/* Derived stats                                                       */
/* ------------------------------------------------------------------ */

function streaks(rounds: readonly DemoRound[]) {
  let best = 0;
  let cur = 0;
  for (const r of rounds) {
    cur = r.won ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return { best, current: cur };
}

function favoriteBet(rounds: readonly DemoRound[]) {
  const counts = new Map<string, number>();
  for (const r of rounds) for (const b of r.bets) counts.set(b.label, (counts.get(b.label) ?? 0) + 1);
  let top = "Red";
  let n = 0;
  for (const [label, c] of counts) {
    if (c > n) {
      top = label;
      n = c;
    }
  }
  return top;
}

function evaluateAchievements(p: DemoPlayer, rounds: readonly DemoRound[], joinedAt: number, hostedTables: number): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];
  const add = (id: AchievementId, earnedAt: number) => earned.push({ id, earnedAt });
  const first = rounds[0];
  if (first) add("first-spin", first.at);

  let blackWins = 0;
  let consecutive = 0;
  let nightRounds = 0;
  let evenKeelRun = 0;
  let hot: number | null = null;
  let zero: number | null = null;
  let straightWin: number | null = null;
  let blackJack: number | null = null;
  let night: number | null = null;
  let evenKeel: number | null = null;
  const days = new Set<number>();
  let regular: number | null = null;

  for (const r of rounds) {
    if (r.result === 0 && zero === null) zero = r.at;
    if (r.bets.some((b) => b.id === "black" && b.won) && ++blackWins === 5) blackJack = r.at;
    if (r.bets.some((b) => b.id.startsWith("straight:") && b.won) && straightWin === null) straightWin = r.at;
    consecutive = r.won ? consecutive + 1 : 0;
    if (consecutive === 3 && hot === null) hot = r.at;
    const hour = new Date(r.at).getUTCHours();
    if (hour < 5 && ++nightRounds === 10) night = r.at;
    evenKeelRun = r.bets.every((b) => b.stake <= 10) ? evenKeelRun + 1 : 0;
    if (evenKeelRun === 20 && evenKeel === null) evenKeel = r.at;
    days.add(Math.floor(r.at / DAY));
    if (days.size === 7 && regular === null) regular = r.at;
  }

  if (blackJack !== null) add("black-jack", blackJack);
  if (zero !== null) add("zero-club", zero);
  if (hot !== null) add("hot-table", hot);
  if (night !== null) add("night-owl", night);
  if (hostedTables > 0) add("table-host", joinedAt + 3 * DAY);
  if (p.games >= 100) add("100-rounds", joinedAt + 14 * DAY);
  if (straightWin !== null) add("straight-shot", straightWin);
  if (evenKeel !== null) add("even-keel", evenKeel);
  // Walk away: a session (gap > 6h after it) that ended with the player ahead.
  for (let i = 0; i < rounds.length - 1; i++) {
    if (rounds[i + 1].at - rounds[i].at > 6 * HOUR) {
      let net = 0;
      for (let j = i; j >= 0 && (j === i || rounds[j + 1].at - rounds[j].at <= 6 * HOUR); j--) net += rounds[j].net;
      if (net > 0) {
        add("walk-away", rounds[i].at);
        break;
      }
    }
  }
  if (regular !== null || p.games >= 200) add("regular", regular ?? joinedAt + 21 * DAY);
  if (joinedAt < Date.UTC(2026, 0, 1)) add("founding-member", joinedAt);
  return earned.sort((a, b) => a.earnedAt - b.earnedAt);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const historyCache = new Map<string, DemoRound[]>();
const profileCache = new Map<string, PlayerProfile>();

function base(wallet: string): DemoPlayer | undefined {
  const w = wallet.toLowerCase();
  return demoPlayers.find((p) => p.wallet.toLowerCase() === w);
}

/** Chronological history (oldest first). Empty for unknown wallets. */
function chronological(wallet: string): DemoRound[] {
  const p = base(wallet);
  if (!p) return [];
  const key = p.wallet;
  let h = historyCache.get(key);
  if (!h) {
    h = generateHistory(p);
    historyCache.set(key, h);
  }
  return h;
}

/** Round history, newest first. Empty for unknown wallets. */
export function getHistory(wallet: string): DemoRound[] {
  return [...chronological(wallet)].reverse();
}

export function getPlayer(wallet: string): PlayerProfile | null {
  const p = base(wallet);
  if (!p) return null;
  const cached = profileCache.get(p.wallet);
  if (cached) return cached;

  const seed = hashWallet(p.wallet);
  const rounds = chronological(p.wallet);
  const joinedAt = Date.UTC(2025, 10, 3) + (seed % 290) * DAY;
  const hostedTables = p.name === "tablehost" ? 12 : p.name === "marlowe.eth" ? 2 : 0;
  const { best, current } = streaks(rounds);
  const histWagered = rounds.reduce((s, r) => s + r.wagered, 0);
  const totalWagered = Math.round((histWagered / rounds.length) * p.games);
  const isEns = p.name.endsWith(".eth");
  const name = p.name.startsWith("0x") ? null : p.name;

  const profile: PlayerProfile = {
    wallet: p.wallet,
    name,
    displayName: name ?? shortAddress(p.wallet),
    joinedAt,
    games: p.games,
    wins: p.wins,
    largestWin: Math.max(p.largestWin, ...rounds.map((r) => r.net)),
    favoriteBet: favoriteBet(rounds),
    totalWagered,
    currentStreak: current,
    bestStreak: Math.max(best, isEns ? 6 : 4),
    hostedTables,
    achievements: evaluateAchievements(p, rounds, joinedAt, hostedTables),
  };
  profileCache.set(p.wallet, profile);
  return profile;
}

export function getAllPlayers(): PlayerProfile[] {
  return demoPlayers.map((p) => getPlayer(p.wallet)!).filter(Boolean);
}

const periodWindow: Record<LeaderboardPeriod, number> = { today: DAY, week: 7 * DAY, all: Number.POSITIVE_INFINITY };

/**
 * Rankings reward play and skillful outcomes only: biggest single win, most
 * rounds settled, longest run of wins. There is no category for volume staked
 * or losses, and no ranking ever benefits from a player losing more.
 */
export function getLeaderboard(period: LeaderboardPeriod, category: LeaderboardCategory): LeaderboardRow[] {
  const since = demoNow - periodWindow[period];
  const rows: Omit<LeaderboardRow, "rank">[] = [];

  for (const p of demoPlayers) {
    const profile = getPlayer(p.wallet)!;
    const rounds = chronological(p.wallet).filter((r) => r.at >= since);
    let value = 0;
    let detail = "";

    if (category === "biggest-win") {
      if (period === "all") {
        value = profile.largestWin;
        const r = rounds.find((x) => x.net === value);
        detail = r ? `${r.bets.filter((b) => b.won).map((b) => b.label).join(", ")} · ${r.tableName}` : "Lifetime best";
      } else {
        const best = rounds.reduce<DemoRound | null>((acc, r) => (r.net > (acc?.net ?? 0) ? r : acc), null);
        value = best?.net ?? 0;
        detail = best ? `${best.bets.filter((b) => b.won).map((b) => b.label).join(", ")} · ${best.tableName}` : "";
      }
    } else if (category === "most-games") {
      value = period === "all" ? profile.games : rounds.length;
      const wins = period === "all" ? profile.wins : rounds.filter((r) => r.won).length;
      detail = value > 0 ? `${wins} won · ${Math.round((wins / value) * 100)}%` : "";
    } else {
      value = period === "all" ? profile.bestStreak : streaks(rounds).best;
      detail = value > 0 ? (profile.currentStreak >= value && value > 0 ? "Still running" : "Run ended") : "";
    }

    if (value <= 0) continue;
    rows.push({ wallet: p.wallet, displayName: profile.displayName, value, valueLabel: formatValue(category, value), detail });
  }

  rows.sort((a, b) => b.value - a.value || a.wallet.localeCompare(b.wallet));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

function formatValue(category: LeaderboardCategory, v: number) {
  if (category === "biggest-win") return `+${v.toLocaleString("en-US")}`;
  if (category === "most-games") return v.toLocaleString("en-US");
  return `${v} ${v === 1 ? "win" : "wins"}`;
}

/* ------------------------------------------------------------------ */
/* Account-only demo data (never shown on public profiles)             */
/* ------------------------------------------------------------------ */

export interface DemoChipBalance {
  denomination: number;
  count: number;
}

export interface DemoTransaction {
  hash: string;
  at: number;
  kind: "Deposit" | "Chip mint" | "Wager" | "Settlement" | "Claim" | "Reward";
  description: string;
  /** Signed value in chips (or USD-eq for deposits/claims). */
  amount: number;
  unit: "chips" | "USD";
  status: "confirmed" | "pending";
}

export interface DemoClaim {
  id: string;
  at: number;
  amount: number;
  asset: string;
  status: "claimable" | "claimed" | "vesting";
}

export function getAccountDemo(wallet: string) {
  const seed = hashWallet(wallet.toLowerCase());
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const chips: DemoChipBalance[] = [1, 5, 10, 25, 50, 100].map((d) => ({
    denomination: d,
    count: d === 100 ? 0 : Math.floor(rng() * (d >= 50 ? 3 : d >= 25 ? 5 : 15)),
  }));
  const chipTotal = chips.reduce((s, c) => s + c.denomination * c.count, 0);
  const winBalance = Math.round((5 + rng() * 40) * 100) / 100;
  const hex = () => "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rng() * 16)]).join("");
  const kinds: DemoTransaction["kind"][] = ["Deposit", "Chip mint", "Wager", "Settlement", "Wager", "Settlement", "Claim", "Reward", "Wager", "Settlement"];
  let t = demoNow - 12 * 60_000;
  const transactions: DemoTransaction[] = kinds.map((kind, i) => {
    t -= Math.round(20 + rng() * 400) * 60_000;
    const stake = pick(rng, stakePool);
    const map: Record<DemoTransaction["kind"], [string, number, DemoTransaction["unit"]]> = {
      Deposit: ["USDC deposit split into liquidity, inventory and reserve", 50, "USD"],
      "Chip mint": ["ERC-1155 chips minted to your wallet", 50, "chips"],
      Wager: ["Wager escrowed for a round", -stake, "chips"],
      Settlement: ["Round settled from the committed seed", rng() < 0.5 ? stake * 2 : 0, "chips"],
      Claim: ["Win balance claimed", -Math.round(rng() * 20 * 100) / 100, "USD"],
      Reward: ["Reward credited to win balance", Math.round(rng() * 12 * 100) / 100, "USD"],
    };
    const [description, amount, unit] = map[kind];
    return { hash: hex(), at: t, kind, description, amount, unit, status: i === 0 ? "pending" : "confirmed" };
  });
  const claims: DemoClaim[] = [
    { id: "clm-3", at: demoNow - 2 * DAY, amount: Math.round(winBalance * 100) / 100, asset: "USDC", status: "claimable" },
    { id: "clm-2", at: demoNow - 9 * DAY, amount: 12.4, asset: "USDC", status: "claimed" },
    { id: "clm-1", at: demoNow - 23 * DAY, amount: 6.05, asset: "USDC", status: "claimed" },
  ];
  const referrals = {
    code: "WH-" + (seed % 100_000).toString(36).toUpperCase().padStart(4, "0"),
    referred: Array.from({ length: 3 }, (_, i) => ({
      wallet: `0x${(hashWallet(wallet + i) >>> 0).toString(16).padStart(8, "0")}${"0".repeat(32)}`,
      joinedAt: demoNow - (3 + i * 11) * DAY,
      status: (i === 0 ? "vested" : i === 1 ? "vesting" : "pending") as "vested" | "vesting" | "pending",
      reward: i === 0 ? 2.5 : i === 1 ? 2.5 : 0,
    })),
  };
  return { chips, chipTotal, winBalance, transactions, claims, referrals };
}

/* ------------------------------------------------------------------ */
/* Formatting (UTC-fixed to avoid server/client drift)                 */
/* ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

export const formatDemoDate = (ts: number) => dateFmt.format(ts);
export const formatDemoDateTime = (ts: number) => `${timeFmt.format(ts)} UTC`;

export function demoRelativeTime(ts: number) {
  const s = Math.max(1, Math.round((demoNow - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
