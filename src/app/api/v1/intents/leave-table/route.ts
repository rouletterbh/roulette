import { z } from "zod";
import { OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { buildLeaveTableIntent } from "@/lib/agent/intents";
import { intentResponse } from "@/lib/agent/intent-response";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Body = z.object({
  /** Escrowed chip units to mint back to your wallet. Number or decimal string. */
  units: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "intents");
  if (limited) return limited;
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const units = BigInt(body.data.units);
  return intentResponse({ intent: buildLeaveTableIntent(units), units: units.toString() });
}
