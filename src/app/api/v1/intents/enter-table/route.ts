import { z } from "zod";
import { OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { buildEnterTableIntent } from "@/lib/agent/intents";
import { intentResponse } from "@/lib/agent/intent-response";
import { chipDenominations, type ChipDenomination } from "@/config/tokens";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Body = z.object({
  /** Chips to escrow, by denomination. Token id = 1000 + denomination. */
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
  const body = await parseBody(req, Body);
  if ("response" in body) return body.response;
  const built = buildEnterTableIntent(body.data.chips.map((c) => ({ denomination: c.denomination, count: c.count })));
  return intentResponse({
    ...built,
    chips: body.data.chips,
    note: "Sign prerequisites first (once per wallet), then the intent. Escrowed units are withdrawable at any time via leave-table.",
  });
}
