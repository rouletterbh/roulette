import { colorOf, columnOf, dozenOf } from "./constants";

/**
 * Bet model. Every bet is a set of covered numbers and a payout multiplier
 * (profit to stake, e.g. straight = 35:1). Total return on a win = stake * (multiplier + 1).
 */
export type BetKind =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "sixline"
  | "column"
  | "dozen"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high";

export interface BetDefinition {
  /** Stable id used as key, e.g. "straight:17", "split:17-20", "red". */
  id: string;
  kind: BetKind;
  label: string;
  numbers: readonly number[];
  /** Profit multiplier (35 for straight). */
  multiplier: number;
}

export interface PlacedBet extends BetDefinition {
  /** Stake in chip units. */
  stake: number;
}

export const PAYOUT: Record<BetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  sixline: 5,
  column: 2,
  dozen: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const OUTSIDE_BETS: Record<string, BetDefinition> = {
  red: { id: "red", kind: "red", label: "Red", multiplier: 1, numbers: range(1, 36).filter((n) => colorOf(n) === "red") },
  black: { id: "black", kind: "black", label: "Black", multiplier: 1, numbers: range(1, 36).filter((n) => colorOf(n) === "black") },
  odd: { id: "odd", kind: "odd", label: "Odd", multiplier: 1, numbers: range(1, 36).filter((n) => n % 2 === 1) },
  even: { id: "even", kind: "even", label: "Even", multiplier: 1, numbers: range(1, 36).filter((n) => n % 2 === 0) },
  low: { id: "low", kind: "low", label: "1–18", multiplier: 1, numbers: range(1, 18) },
  high: { id: "high", kind: "high", label: "19–36", multiplier: 1, numbers: range(19, 36) },
  "dozen:1": { id: "dozen:1", kind: "dozen", label: "1st 12", multiplier: 2, numbers: range(1, 36).filter((n) => dozenOf(n) === 1) },
  "dozen:2": { id: "dozen:2", kind: "dozen", label: "2nd 12", multiplier: 2, numbers: range(1, 36).filter((n) => dozenOf(n) === 2) },
  "dozen:3": { id: "dozen:3", kind: "dozen", label: "3rd 12", multiplier: 2, numbers: range(1, 36).filter((n) => dozenOf(n) === 3) },
  "column:1": { id: "column:1", kind: "column", label: "Column 1", multiplier: 2, numbers: range(1, 36).filter((n) => columnOf(n) === 1) },
  "column:2": { id: "column:2", kind: "column", label: "Column 2", multiplier: 2, numbers: range(1, 36).filter((n) => columnOf(n) === 2) },
  "column:3": { id: "column:3", kind: "column", label: "Column 3", multiplier: 2, numbers: range(1, 36).filter((n) => columnOf(n) === 3) },
};

export function straight(n: number): BetDefinition {
  return { id: `straight:${n}`, kind: "straight", label: `${n}`, numbers: [n], multiplier: 35 };
}

export function split(a: number, b: number): BetDefinition {
  const [x, y] = a < b ? [a, b] : [b, a];
  return { id: `split:${x}-${y}`, kind: "split", label: `${x}/${y}`, numbers: [x, y], multiplier: 17 };
}

export function street(row: number): BetDefinition {
  const start = (row - 1) * 3 + 1;
  const nums = [start, start + 1, start + 2];
  return { id: `street:${start}`, kind: "street", label: `${start}–${start + 2}`, numbers: nums, multiplier: 11 };
}

export function corner(topLeft: number): BetDefinition {
  const nums = [topLeft, topLeft + 1, topLeft + 3, topLeft + 4];
  return { id: `corner:${topLeft}`, kind: "corner", label: nums.join("/"), numbers: nums, multiplier: 8 };
}

export function sixLine(row: number): BetDefinition {
  const start = (row - 1) * 3 + 1;
  const nums = range(start, start + 5);
  return { id: `sixline:${start}`, kind: "sixline", label: `${start}–${start + 5}`, numbers: nums, multiplier: 5 };
}

export function betFromId(id: string): BetDefinition | null {
  if (OUTSIDE_BETS[id]) return OUTSIDE_BETS[id];
  const [kind, rest] = id.split(":");
  if (kind === "straight") return straight(Number(rest));
  if (kind === "split") {
    const [a, b] = rest.split("-").map(Number);
    return split(a, b);
  }
  if (kind === "street") return street(Math.floor((Number(rest) - 1) / 3) + 1);
  if (kind === "corner") return corner(Number(rest));
  if (kind === "sixline") return sixLine(Math.floor((Number(rest) - 1) / 3) + 1);
  return null;
}

/** Validates a bet definition's geometry (used in tests and before acceptance). */
export function isValidBet(bet: BetDefinition): boolean {
  const ns = bet.numbers;
  if (ns.some((n) => n < 0 || n > 36 || !Number.isInteger(n))) return false;
  if (PAYOUT[bet.kind] !== bet.multiplier) return false;
  switch (bet.kind) {
    case "straight": return ns.length === 1;
    case "split": {
      if (ns.length !== 2) return false;
      const [a, b] = ns;
      if (a === 0) return b >= 1 && b <= 3;
      return (b - a === 1 && columnOf(a) !== 3) || b - a === 3;
    }
    case "street": return ns.length === 3 && columnOf(ns[0]) === 1 && ns[2] - ns[0] === 2;
    case "corner": return ns.length === 4 && columnOf(ns[0]) !== 3 && ns[3] - ns[0] === 4;
    case "sixline": return ns.length === 6 && columnOf(ns[0]) === 1 && ns[5] - ns[0] === 5;
    case "column": case "dozen": return ns.length === 12;
    default: return ns.length === 18;
  }
}
