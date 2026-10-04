import { z } from "zod";
import { err, OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { computeQuote, IntentBetInputSchema, QuoteError } from "@/lib/agent/quote";
import { encodeBetById } from "@/lib/agent/encode-bets";
import { buildPlaceBetsIntent } from "@/lib/agent/intents";
import { intentResponse } from "@/lib/agent/intent-response";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { ChainPlaceBetsBodySchema, chainPlaceBetsIntent } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Body = z.object({
  /** Ignored in demo mode; required when chain-backed. */
  address: z.string().optional(),
  /** On-chain round id (must be Open). Accepts a number or a decimal string for large ids. */
  roundId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  bets: z.array(IntentBetInputSchema).min(1).max(64),
  table: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "intents");
  if (limited) return limited;
  if (CHAIN_BACKED) {
    const cb = await parseBody(req, ChainPlaceBetsBodySchema);
    if ("response" in cb) return cb.response;
    return chainPlaceBetsIntent(getChainReader(), cb.data);
  }
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;

  let quote;
  try {
    quote = computeQuote({ bets: body.data.bets, table: body.data.table });
  } catch (e) {
    if (e instanceof QuoteError) return err(e.code, e.message, { details: e.details });
    throw e;
  }
  if (!quote.accepted) {
    return err("TABLE_LIMIT", quote.limit.reason ?? "Rejected by the pre-acceptance check", { details: { quote } });
  }

  const roundId = BigInt(body.data.roundId);
  const encoded = body.data.bets.map((b) => encodeBetById(b.betId, b.stake));
  const summary = quote.bets.map((b) => `${b.label} ${b.stake}`).join(", ");
  const built = buildPlaceBetsIntent(roundId, encoded, summary);
  return intentResponse({
    intent: built,
    quote,
    maxLiability: quote.maximumLiability.maxNetPayout,
    limitCheck: quote.limit,
    encoding: "IRiskEngine.Bet { uint64 numbersMask (bit i = pocket i), uint16 multiplier, uint128 stake }",
  });
}
