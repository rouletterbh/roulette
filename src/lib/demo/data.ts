import { colorOf } from "@/lib/roulette/constants";
import type { TreasurySnapshot } from "@/lib/risk/engine";

/**
 * DEMO MODE data. Everything here is simulated and must be labeled DEMO in the UI.
 * Never pass this as live blockchain state.
 */
export const demoTreasury: TreasurySnapshot & { rewardInventory: number; unsettledRounds: number; revenue: number } = {
  bankroll: 347.18,
  reservedLiability: 50.76,
  claimableRewards: 18.42,
  protocolReserve: 27.0,
  rewardInventory: 64.9,
  unsettledRounds: 3,
  revenue: 41.1,
};

export type TableSpeed = "relaxed" | "standard" | "fast";
export interface DemoTable {
  id: string;
  name: string;
  variant: "European Roulette";
  players: number;
  spectators: number;
  minBet: number;
  maxBet: number;
  speed: TableSpeed;
  status: "live" | "locked" | "starting";
  visibility: "public" | "private";
  lockedReason?: string;
  recent: number[];
}

export const demoTables: DemoTable[] = [
  { id: "neon-01", name: "NEON 01", variant: "European Roulette", players: 12, spectators: 31, minBet: 1, maxBet: 40, speed: "standard", status: "live", visibility: "public", recent: [17, 32, 0, 14, 26, 8, 19, 3, 22, 11, 5, 29] },
  { id: "classic", name: "CLASSIC", variant: "European Roulette", players: 7, spectators: 9, minBet: 1, maxBet: 18, speed: "relaxed", status: "live", visibility: "public", recent: [4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30] },
  { id: "late-shift", name: "LATE SHIFT", variant: "European Roulette", players: 3, spectators: 4, minBet: 1, maxBet: 10, speed: "fast", status: "live", visibility: "public", recent: [8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9] },
  { id: "high-roller", name: "HIGH ROLLER", variant: "European Roulette", players: 0, spectators: 0, minBet: 25, maxBet: 500, speed: "standard", status: "locked", visibility: "public", lockedReason: "Opens when treasury liquidity supports a 500-chip maximum.", recent: [] },
];

export interface DemoPlayer {
  wallet: string;
  name: string;
  hue: number;
  streak: number;
  games: number;
  wins: number;
  largestWin: number;
}

export const demoPlayers: DemoPlayer[] = [
  { wallet: "0x23a1b9c0d4e5f60718293a4b5c6d7e8f9a0b1a91", name: "marlowe.eth", hue: 86, streak: 3, games: 412, wins: 190, largestWin: 180 },
  { wallet: "0x8f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6", name: "0x8f1e…c7d6", hue: 262, streak: 0, games: 88, wins: 39, largestWin: 72 },
  { wallet: "0x5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d", name: "tablehost", hue: 14, streak: 1, games: 1203, wins: 571, largestWin: 350 },
  { wallet: "0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9", name: "quietwheel", hue: 210, streak: 5, games: 240, wins: 118, largestWin: 144 },
  { wallet: "0xd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3", name: "nightowl.eth", hue: 40, streak: 0, games: 977, wins: 450, largestWin: 288 },
  { wallet: "0x1f2e3d4c5b6a79887a6b5c4d3e2f1a0b9c8d7e6f", name: "0x1f2e…7e6f", hue: 330, streak: 2, games: 61, wins: 30, largestWin: 36 },
];

export const demoRecentWinners = [
  { player: demoPlayers[0], amount: 180, bet: "17 Straight", ago: 42_000 },
  { player: demoPlayers[3], amount: 36, bet: "Red", ago: 95_000 },
  { player: demoPlayers[4], amount: 72, bet: "2nd 12", ago: 160_000 },
  { player: demoPlayers[2], amount: 24, bet: "Corner 25/26/28/29", ago: 300_000 },
];

export function colorStats(numbers: number[]) {
  const c = { red: 0, black: 0, green: 0 };
  for (const n of numbers) c[colorOf(n)]++;
  return c;
}
