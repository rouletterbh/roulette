import { err, ok, OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { computeQuote, QuoteBodySchema, QuoteError } from "@/lib/agent/quote";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { ChainQuoteBodySchema, chainQuote } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function POST(req: Request) {
  const limited = rateLimit(req, "quote");
  if (limited) return limited;
  if (CHAIN_BACKED) {
    const cb = await parseBody(req, ChainQuoteBodySchema);
    if ("response" in cb) return cb.response;
    return chainQuote(getChainReader(), cb.data);
  }
  const body = await parseBody(req, QuoteBodySchema);
  if ("response" in body) return body.response;
  try {
    const quote = computeQuote(body.data);
    return ok(quote);
  } catch (e) {
    if (e instanceof QuoteError) return err(e.code, e.message, { details: e.details });
    throw e;
  }
}
