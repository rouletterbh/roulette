import { err, ok, OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { computeQuote, QuoteBodySchema, QuoteError } from "@/lib/agent/quote";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function POST(req: Request) {
  const limited = rateLimit(req, "quote");
  if (limited) return limited;
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
