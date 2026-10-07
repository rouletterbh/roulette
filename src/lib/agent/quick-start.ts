import { chipDenominations } from "@/config/tokens";
import { chipUnits, selectChips, type ChipBalances } from "@/lib/web3/contracts";
import { agentCode, type StrategyClass } from "@/lib/agent/states";
import type { AgentCadence, AgentCondition, AgentRules, AgentSeat } from "@/store/agent-seat";

/**
 * Agent quick start: four styles, one budget, everything else derived.
 * Pure logic only (tested next to this file). Every style is a preset of the existing
 * seat rules model (src/store/agent-seat.ts); nothing here adds a rule type.
 */

export type QuickStyleId = "red-black" | "streak" | "dozens" | "one-number";

export interface QuickStyle {
  id: QuickStyleId;
  title: string;
  /** One line: what the agent does. */
  description: string;
  /** Extra honest line shown on the card, if any. */
  note?: string;
  betId: string;
  cadence: AgentCadence;
  condition: AgentCondition | null;
  /** Winning numbers out of 37 for one bet. */
  wins: number;
  payout: string;
  strategyClass: StrategyClass;
}

export const QUICK_STYLES: readonly QuickStyle[] = [
  { id: "red-black", title: "Red or black", description: "1 chip on red every round.", betId: "red", cadence: "every", condition: null, wins: 18, payout: "1:1", strategyClass: "Conservative" },
  {
    id: "streak",
    title: "Wait for a streak",
    description: "After 3 reds in the last 3 rounds, 1 chip on black. Bets less often.",
    note: "Same odds when it bets: streaks do not change the odds. Every spin is independent.",
    betId: "black",
    cadence: "after-condition",
    condition: { type: "color-count", side: "red", window: 3, min: 3 },
    wins: 18,
    payout: "1:1",
    strategyClass: "Contrarian",
  },
  { id: "dozens", title: "Dozens", description: "1 chip on the 1st dozen (1–12) every round.", betId: "dozen:1", cadence: "every", condition: null, wins: 12, payout: "2:1", strategyClass: "Adaptive Low Variance" },
  { id: "one-number", title: "One number", description: "1 chip on 17 every round.", betId: "straight:17", cadence: "every", condition: null, wins: 1, payout: "35:1", strategyClass: "Single Number" },
];

export const QUICK_EDGE_LINE = "Every style loses about 2.7% of what it bets over time. An agent follows rules; it does not predict the wheel.";

export function quickStyle(id: QuickStyleId | string | null | undefined): QuickStyle | undefined {
  return QUICK_STYLES.find((s) => s.id === id);
}

/** "18 in 37 (48.6%)" */
export function winChanceLabel(wins: number): string {
  return `${wins} in 37 (${((wins / 37) * 100).toFixed(1)}%)`;
}

/* ------------------------------------------------------------------ limits */

export const QUICK_STAKE = 1;
export const QUICK_TIME_LIMIT_MINUTES = 60;
export const QUICK_MIN_ROUNDS = 10;
export const QUICK_MAX_ROUNDS = 200;

/** Everything except the bet, derived from the budget. The budget is the hard cap: the agent can never lose more than it was sent. */
export function quickLimits(budget: number): Pick<AgentRules, "maxBet" | "maxRounds" | "stopLoss" | "stopWin" | "timeLimitMinutes"> {
  const b = Math.max(1, Math.floor(budget));
  return { maxBet: QUICK_STAKE, maxRounds: Math.max(QUICK_MIN_ROUNDS, Math.min(QUICK_MAX_ROUNDS, b * 4)), stopLoss: b, stopWin: null, timeLimitMinutes: QUICK_TIME_LIMIT_MINUTES };
}

export function quickRules(style: QuickStyle, budget: number): AgentRules {
  return { bets: [{ betId: style.betId, stake: QUICK_STAKE }], cadence: style.cadence, condition: style.condition ? { ...style.condition } : null, ...quickLimits(budget) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Plays up to 100 rounds or 1 hour. Stops when the 25 chips are gone or you press Stop. Whatever is left comes back to your wallet." */
export function quickSummary(budget: number, practice = false): string {
  const { maxRounds, timeLimitMinutes } = quickLimits(budget);
  const time = timeLimitMinutes === 60 ? "1 hour" : `${timeLimitMinutes} minutes`;
  const gone = budget === 1 ? "the 1 chip is gone" : `the ${budget} chips are gone`;
  const after = practice ? "Practice chips only: nothing has value." : "Whatever is left comes back to your wallet.";
  return `Plays up to ${maxRounds} rounds or ${time}. Stops when ${gone} or you press Stop. ${after}`;
}

/** Machine-style name like ZERO-61; the seat's code is set to the same value. */
export function quickAgentCode(seed: string): string {
  return agentCode(seed);
}

/* ----------------------------------------------------------------- budgets */

/** Round numbers offered first, smallest to largest. */
export const ROUND_BUDGETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000] as const;
const MAX_PRESETS = 5;
/** Above this a wallet always has enough round-number candidates; skip the exhaustive scan. */
const SCAN_LIMIT = 20000;

export interface BudgetOption {
  units: number;
  label: string;
  all: boolean;
}

export type BudgetPlan =
  /** Several amounts, the last one "All N chips". */
  | { kind: "options"; total: number; options: BudgetOption[] }
  /** The wallet's chips cannot make any smaller amount: only "All N chips". */
  | { kind: "all-only"; total: number; options: BudgetOption[] }
  /** Nothing in the wallet, but chips sit in table escrow. */
  | { kind: "escrow-only"; escrow: number; options: BudgetOption[] }
  /** No chips anywhere. */
  | { kind: "empty"; options: BudgetOption[] };

/** Up to k values spread evenly across a sorted list (first and last included). */
function spread(values: number[], k: number): number[] {
  if (k <= 0) return [];
  if (values.length <= k) return values;
  if (k === 1) return [values[0]];
  const picked = new Set<number>();
  for (let i = 0; i < k; i++) picked.add(values[Math.round((i * (values.length - 1)) / (k - 1))]);
  return [...picked];
}

/**
 * Up to `max` budgets strictly below `limit` that `canMake` accepts, preferring round
 * numbers (5, 10, 25, 50, 100, …), then multiples of 5, then (only when nothing else
 * exists) any other amount.
 */
export function budgetCandidates(limit: number, canMake: (units: number) => boolean, max: number): number[] {
  const picked: number[] = [];
  const add = (xs: number[]) => picked.push(...spread(xs.filter((x) => !picked.includes(x)), max - picked.length));
  add(ROUND_BUDGETS.filter((u) => u < limit && canMake(u)));
  if (picked.length < max && limit <= SCAN_LIMIT) {
    const fives: number[] = [];
    for (let u = 5; u < limit; u += 5) if (canMake(u)) fives.push(u);
    add(fives);
    if (picked.length === 0) {
      const any: number[] = [];
      for (let u = 1; u < limit; u++) if (canMake(u)) any.push(u);
      add(any.slice(0, 2));
    }
  }
  return picked.sort((a, b) => a - b);
}

const chipsLabel = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "chip" : "chips"}`;

/**
 * Budget choices from the wallet's actual chips (demo mode off). Chips are fixed
 * denominations that cannot be split, so only amounts `selectChips` makes EXACTLY are
 * offered (the same selection the funding transfer uses), plus "All N chips", which
 * is always exact. Escrow is not spendable by an agent: it is only reported.
 */
export function walletBudgetPlan(balances: Partial<ChipBalances>, escrowUnits: number): BudgetPlan {
  const total = chipUnits(balances);
  if (total <= 0) return escrowUnits > 0 ? { kind: "escrow-only", escrow: escrowUnits, options: [] } : { kind: "empty", options: [] };
  const smaller = budgetCandidates(total, (u) => selectChips(balances, u).exact, MAX_PRESETS - 1).map((u) => ({ units: u, label: chipsLabel(u), all: false }));
  const options = [...smaller, { units: total, label: `All ${chipsLabel(total)}`, all: true }];
  return smaller.length ? { kind: "options", total, options } : { kind: "all-only", total, options };
}

/**
 * Budget choices for practice / demo balances (plain numbers, no denominations). The
 * allowance cap stays at `share` of the balance there.
 */
export function unitBudgetOptions(balance: number, share: number): BudgetOption[] {
  const cap = Math.floor(Math.max(0, balance) * share);
  if (cap < 1) return [];
  const round = ROUND_BUDGETS.filter((u) => u <= cap);
  const values = round.length ? spread([...round], MAX_PRESETS) : [cap];
  return values.map((u) => ({ units: u, label: chipsLabel(u), all: false }));
}

/** One sentence on why only "All N" can be offered, from the wallet's denominations. */
export function denominationNote(balances: Partial<ChipBalances>): string {
  const held = chipDenominations.filter((d) => (balances[d] ?? 0n) > 0n).map((d) => `${Number(balances[d])} × ${d}`);
  return `Chips come in fixed sizes (1, 5, 10, 25, 50, 100) and cannot be split, and your wallet holds ${held.join(" + ")}, so no smaller amount can be sent.`;
}

/* ------------------------------------------------------------ plain status */

type StatusSeat = Pick<AgentSeat, "status" | "lastRoundId" | "decisions" | "allowance" | "net" | "stoppedReason" | "chain">;

/** "Playing · round #4821 · 3 bets so far · 22 chips left" */
export function plainStatus(seat: StatusSeat): string {
  const left = Math.max(0, seat.allowance + seat.net);
  const bets = `${plural(seat.decisions, "bet")} so far`;
  const chips = `${plural(left, "chip")} left`;
  switch (seat.status) {
    case "pending-approval":
      return seat.chain && seat.chain.fundedAt == null ? "Not started · waiting for you to fund it" : "Not started · waiting for your approval";
    case "active":
      return ["Playing", seat.lastRoundId != null ? `round #${seat.lastRoundId}` : "waiting for the next round", bets, chips].join(" · ");
    case "paused":
      return ["Paused", bets, chips].join(" · ");
    case "stopped":
      return ["Stopped", ...(seat.stoppedReason ? [seat.stoppedReason.replace(/\.$/, "")] : []), bets].join(" · ");
  }
}
