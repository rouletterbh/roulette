import { z } from "zod";
import { OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { buildLeaveTableIntent } from "@/lib/agent/intents";
import { intentResponse } from "@/lib/agent/intent-response";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { ChainLeaveTableBodySchema, chainLeaveTableIntent } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Body = z.object({
  /** Ignored in demo mode; required when chain-backed. */
  address: z.string().optional(),
  /** Escrowed chip units to mint back to your wallet. Number or decimal string. */
  units: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "intents");
  if (limited) return limited;
  if (CHAIN_BACKED) {
    const cb = await parseBody(req, ChainLeaveTableBodySchema);
    if ("response" in cb) return cb.response;
    return chainLeaveTableIntent(getChainReader(), cb.data);
  }
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const units = BigInt(body.data.units);
  return intentResponse({ intent: buildLeaveTableIntent(units), units: units.toString() });
}
