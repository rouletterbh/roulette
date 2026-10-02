import { toHex, type Hex } from "viem";
import { mulberry32, hashString } from "./prng";
import { demoTables } from "./data";
import { demoNow } from "./players";
import { commit, deriveResult, verifyRound } from "@/lib/fairness/commit-reveal";
import { colorOf, columnOf, dozenOf, type PocketColor } from "@/lib/roulette/constants";
import { OUTSIDE_BETS, straight, type PlacedBet } from "@/lib/roulette/bets";
import { settleBets } from "@/lib/roulette/settle";

/**
 * DEMO round history with REAL fairness proofs.
 *
 * Seeds are drawn from a seeded PRNG (deterministic across server and client),
 * the commitment is keccak256(serverSeed) and the result is derived with the same
 * `deriveResult` used by the practice engine and mirrored by RandomnessManager.sol.
 * Every round therefore passes `verifyRound`. Nothing here uses Math.random.
 *
 * The newest rounds of each live table are chosen so that their results match the
 * table's published `recent` numbers: for those rounds the generator keeps drawing
 * server seeds until the derivation lands on the target pocket, which is exactly
 * what makes the proof honest (the seed is committed, the result is derived).
 */
export interface DemoFairRound {
  roundId: number;
  tableId: string;
  tableName: string;
  /** Settlement time, unix ms (UTC). */
  at: number;
  commitment: Hex;
  serverSeed: Hex;
  playerSeed: Hex;
  blockRef: Hex;
  result: number;
  color: PocketColor;
  parity: "odd" | "even" | "zero";
  dozen: 1 | 2 | 3 | null;
  column: 1 | 2 | 3 | null;
  half: "low" | "high" | null;
  betCount: number;
  totalStaked: number;
  totalReturned: number;
  /** Always true: the round is re-verified at generation time. */
  verified: boolean;
}

export const DEMO_ROUND_COUNT = 480;
const FIRST_ROUND_ID = 120_000;
const GENERATOR_SEED = hashString("demo-rounds-v1");

const liveTables = demoTables.filter((t) => t.status === "live");
const outsidePool = Object.values(OUTSIDE_BETS);
const stakePool = [1, 1, 1, 5, 5, 5, 10, 10, 25] as const;
const speedGapSeconds = { relaxed: [60, 140], standard: [35, 90], fast: [20, 50] } as const;

function hex32(rng: () => number): Hex {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 4) {
    const w = Math.floor(rng() * 0x1_0000_0000) >>> 0;
    bytes[i] = w >>> 24;
    bytes[i + 1] = (w >>> 16) & 0xff;
    bytes[i + 2] = (w >>> 8) & 0xff;
    bytes[i + 3] = w & 0xff;
  }
  return toHex(bytes);
}

const pick = <T,>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)]!;

function parityOf(n: number): DemoFairRound["parity"] {
  return n === 0 ? "zero" : n % 2 ? "odd" : "even";
}
function halfOf(n: number): DemoFairRound["half"] {
  return n === 0 ? null : n <= 18 ? "low" : "high";
}

function generate(): DemoFairRound[] {
  const rng = mulberry32(GENERATOR_SEED);

  // 1. Table assignment, weighted by seated players, and timestamps walking back from demoNow.
  const weights = liveTables.map((t) => Math.max(1, t.players));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const assignment: Array<{ table: (typeof liveTables)[number]; at: number }> = [];
  let t = demoNow - 90_000;
  for (let i = 0; i < DEMO_ROUND_COUNT; i++) {
    let r = rng() * totalWeight;
    let idx = 0;
    while (r >= weights[idx]! && idx < weights.length - 1) r -= weights[idx++]!;
    const table = liveTables[idx]!;
    assignment.push({ table, at: t });
    const [lo, hi] = speedGapSeconds[table.speed];
    t -= Math.round(lo + rng() * (hi - lo)) * 1000;
  }
  assignment.reverse(); // chronological, oldest first

  // 2. Target results for the newest rounds of each table (match the published `recent`).
  const targets = new Map<number, number>();
  for (const table of liveTables) {
    let k = 0;
    for (let i = assignment.length - 1; i >= 0 && k < table.recent.length; i--) {
      if (assignment[i]!.table.id === table.id) targets.set(i, table.recent[k++]!);
    }
  }

  // 3. Seeds, derivation and settlement.
  const rounds: DemoFairRound[] = [];
  for (let i = 0; i < assignment.length; i++) {
    const { table, at } = assignment[i]!;
    const roundId = FIRST_ROUND_ID + i;
    const playerSeed = hex32(rng);
    const blockRef = hex32(rng);
    let serverSeed = hex32(rng);
    let result = deriveResult(serverSeed, playerSeed, blockRef, roundId);
    const target = targets.get(i);
    if (target !== undefined) {
      let guard = 0;
      while (result !== target && guard++ < 20_000) {
        serverSeed = hex32(rng);
        result = deriveResult(serverSeed, playerSeed, blockRef, roundId);
      }
    }
    const commitment = commit(serverSeed);

    const betCount = 1 + Math.floor(rng() * Math.max(1, Math.min(table.players, 8)));
    const bets: PlacedBet[] = [];
    for (let b = 0; b < betCount; b++) {
      const def = rng() < 0.3 ? straight(Math.floor(rng() * 37)) : pick(rng, outsidePool);
      bets.push({ ...def, stake: Math.min(pick(rng, stakePool), table.maxBet) });
    }
    const s = settleBets(bets, result);

    const round: DemoFairRound = {
      roundId,
      tableId: table.id,
      tableName: table.name,
      at,
      commitment,
      serverSeed,
      playerSeed,
      blockRef,
      result,
      color: colorOf(result),
      parity: parityOf(result),
      dozen: dozenOf(result),
      column: columnOf(result),
      half: halfOf(result),
      betCount,
      totalStaked: s.totalStaked,
      totalReturned: s.totalReturned,
      verified: false,
    };
    round.verified = verifyRound({ roundId, commitment, serverSeed, playerSeed, blockReference: blockRef, result, createdAt: at, verified: false });
    rounds.push(round);
  }
  return rounds.reverse(); // newest first
}

let cache: DemoFairRound[] | null = null;

/** All demo rounds, newest first. */
export function getDemoRounds(): DemoFairRound[] {
  if (!cache) cache = generate();
  return cache;
}

export function getDemoRound(roundId: number): DemoFairRound | null {
  return getDemoRounds().find((r) => r.roundId === roundId) ?? null;
}

export interface ListRoundsOptions {
  table?: string;
  limit?: number;
  /** Return rounds with roundId strictly below this value. */
  cursor?: number;
}

export function listDemoRounds({ table, limit = 20, cursor }: ListRoundsOptions = {}) {
  let rows = getDemoRounds();
  if (table) rows = rows.filter((r) => r.tableId === table);
  if (cursor !== undefined) rows = rows.filter((r) => r.roundId < cursor);
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1]!.roundId : null;
  return { rounds: page, nextCursor, total: rows.length };
}

export interface RoundStats {
  table: string | null;
  window: number;
  sampled: number;
  color: Record<PocketColor, number>;
  parity: Record<"odd" | "even" | "zero", number>;
  dozen: Record<"1" | "2" | "3" | "zero", number>;
  column: Record<"1" | "2" | "3" | "zero", number>;
  half: Record<"low" | "high" | "zero", number>;
  pockets: number[];
  latest: number[];
}

/** Descriptive counts over the most recent `window` rounds. Every spin is independent; counts describe the past only. */
export function roundStats(table: string | undefined, window = 100): RoundStats {
  const rows = listDemoRounds({ table, limit: window }).rounds;
  const stats: RoundStats = {
    table: table ?? null,
    window,
    sampled: rows.length,
    color: { red: 0, black: 0, green: 0 },
    parity: { odd: 0, even: 0, zero: 0 },
    dozen: { "1": 0, "2": 0, "3": 0, zero: 0 },
    column: { "1": 0, "2": 0, "3": 0, zero: 0 },
    half: { low: 0, high: 0, zero: 0 },
    pockets: Array.from({ length: 37 }, () => 0),
    latest: rows.slice(0, 12).map((r) => r.result),
  };
  for (const r of rows) {
    stats.color[r.color]++;
    stats.parity[r.parity]++;
    stats.dozen[r.dozen === null ? "zero" : (String(r.dozen) as "1" | "2" | "3")]++;
    stats.column[r.column === null ? "zero" : (String(r.column) as "1" | "2" | "3")]++;
    stats.half[r.half ?? "zero"]++;
    stats.pockets[r.result]!++;
  }
  return stats;
}
