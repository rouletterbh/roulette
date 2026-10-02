import { z } from "zod";
import { betFromId, isValidBet, type PlacedBet } from "@/lib/roulette/bets";
import { maximumLiability, potentialPayout } from "@/lib/roulette/settle";
import { checkWager, getMaximumSafeBet, type TreasurySnapshot } from "@/lib/risk/engine";
import { demoTables, demoTreasury, type DemoTable } from "@/lib/demo/data";

/**
 * Quote = the exact pre-acceptance check the table runs, exposed to agents so
 * they can see a rejection before spending gas. Mirrors RiskEngine.checkWager.
 */
export const BetInputSchema = z.object({
  /** Stable bet id, e.g. "red", "dozen:2", "straight:17", "split:17-20", "corner:25". */
  betId: z.string().min(1).max(32),
  /** Stake in chip units. */
  stake: z.number().positive().finite(),
});

export const QuoteBodySchema = z.object({
  bets: z.array(BetInputSchema).min(1).max(64),
  /** Optional table id; applies the table's min/max stake on top of the treasury limit. */
  table: z.string().min(1).max(64).optional(),
});
export type QuoteBody = z.infer<typeof QuoteBodySchema>;

/** Stricter variant for on-chain intents: stakes must be whole chip units (uint128). */
export const IntentBetInputSchema = BetInputSchema.extend({ stake: z.number().int().positive() });

export interface QuoteLine {
  betId: string;
  kind: string;
  label: string;
  numbers: number[];
  multiplier: number;
  stake: number;
  /** Total returned on a win (stake + profit). */
  potentialPayout: number;
  potentialProfit: number;
  /** Null when geometry is valid; otherwise the reason. */
  error: string | null;
}

export interface Quote {
  bets: QuoteLine[];
  totalWager: number;
  maximumLiability: { worstResult: number; maxReturn: number; maxNetPayout: number };
  limit: {
    ok: boolean;
    reason: string | null;
    maxNetPayout: number;
    maxRoundExposure: number;
    availableBankroll: number;
    /** Largest single-bet stake currently accepted for a straight-up (35:1) and even-money (1:1) bet. */
    maxStraight: number;
    maxOutside: number;
  };
  table: { id: string; minBet: number; maxBet: number; status: DemoTable["status"] } | null;
  /** Whether the whole set would be accepted as-is. */
  accepted: boolean;
}

export class QuoteError extends Error {
  constructor(
    public code: "VALIDATION_ERROR" | "NOT_FOUND",
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function resolveBets(input: QuoteBody["bets"]): { placed: PlacedBet[]; lines: QuoteLine[] } {
  const placed: PlacedBet[] = [];
  const lines: QuoteLine[] = [];
  const seen = new Set<string>();
  for (const b of input) {
    const def = betFromId(b.betId);
    if (!def) throw new QuoteError("VALIDATION_ERROR", `Unknown bet id "${b.betId}"`, { betId: b.betId });
    if (!isValidBet(def)) throw new QuoteError("VALIDATION_ERROR", `Bet "${b.betId}" has invalid geometry`, { betId: b.betId });
    if (seen.has(def.id)) throw new QuoteError("VALIDATION_ERROR", `Duplicate bet id "${def.id}"; merge stakes client-side`, { betId: def.id });
    seen.add(def.id);
    const pb: PlacedBet = { ...def, stake: b.stake };
    placed.push(pb);
    lines.push({
      betId: def.id,
      kind: def.kind,
      label: def.label,
      numbers: [...def.numbers],
      multiplier: def.multiplier,
      stake: b.stake,
      potentialPayout: potentialPayout(pb),
      potentialProfit: potentialPayout(pb) - b.stake,
      error: null,
    });
  }
  return { placed, lines };
}

export function computeQuote(body: QuoteBody, treasury: TreasurySnapshot = demoTreasury): Quote {
  const table = body.table ? demoTables.find((t) => t.id === body.table) : undefined;
  if (body.table && !table) throw new QuoteError("NOT_FOUND", `Unknown table "${body.table}"`);

  const { placed, lines } = resolveBets(body.bets);
  const liability = maximumLiability(placed);
  const check = checkWager(treasury, placed);
  const safeStraight = getMaximumSafeBet(treasury, 35);
  const safeOutside = getMaximumSafeBet(treasury, 1);

  let reason: string | null = check.ok ? null : (check.reason ?? "Rejected");
  if (table) {
    if (table.status !== "live") reason = reason ?? `Table is ${table.status}`;
    const out = placed.find((b) => b.stake < table.minBet || b.stake > table.maxBet);
    if (out) reason = reason ?? `Stake ${out.stake} on ${out.id} is outside the table range ${table.minBet}–${table.maxBet}`;
  }

  return {
    bets: lines,
    totalWager: placed.reduce((s, b) => s + b.stake, 0),
    maximumLiability: liability,
    limit: {
      ok: reason === null,
      reason,
      maxNetPayout: check.maxNetPayout,
      maxRoundExposure: check.maxRoundExposure,
      availableBankroll: check.availableBankroll,
      maxStraight: table ? Math.min(table.maxBet, safeStraight.maxStake) : safeStraight.maxStake,
      maxOutside: table ? Math.min(table.maxBet, safeOutside.maxStake) : safeOutside.maxStake,
    },
    table: table ? { id: table.id, minBet: table.minBet, maxBet: table.maxBet, status: table.status } : null,
    accepted: reason === null,
  };
}
