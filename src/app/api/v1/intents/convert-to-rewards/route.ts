import { z } from "zod";
import { OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { buildConvertToRewardsIntent } from "@/lib/agent/intents";
import { intentResponse } from "@/lib/agent/intent-response";
import { chipDenominations, type ChipDenomination } from "@/config/tokens";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { ChainConvertToRewardsBodySchema, chainConvertToRewardsIntent } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Body = z.object({
  /** Ignored when there is no chain to check balances against; required when chain-backed. */
  address: z.string().optional(),
  /** Chips to convert, by denomination. Token id = 1000 + denomination. */
  chips: z
    .array(
      z.object({
        denomination: z
          .number()
          .int()
          .refine((d): d is ChipDenomination => (chipDenominations as readonly number[]).includes(d), { message: `Denomination must be one of ${chipDenominations.join(", ")}` }),
        count: z.number().int().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(6),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "intents");
  if (limited) return limited;
  if (CHAIN_BACKED) {
    const cb = await parseBody(req, ChainConvertToRewardsBodySchema);
    if ("response" in cb) return cb.response;
    return chainConvertToRewardsIntent(getChainReader(), cb.data);
  }
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const built = buildConvertToRewardsIntent(body.data.chips.map((c) => ({ denomination: c.denomination, count: c.count })));
  return intentResponse({
    ...built,
    chips: body.data.chips,
    oneWay: true as const,
    note: "Sign prerequisites first (once per wallet), then the intent. One-way: the resulting win balance can only be claimed as reward assets (claim intent), never withdrawn as ETH.",
  });
}
