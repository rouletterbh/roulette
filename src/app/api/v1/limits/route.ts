import { z } from "zod";
import { ok, OPTIONS, parseQuery } from "@/lib/agent/envelope";
import { getMaximumSafeBet } from "@/lib/risk/engine";
import { demoTreasury } from "@/lib/demo/data";
import { PAYOUT } from "@/lib/roulette/bets";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Query = z.object({
  /** Profit multiplier (35 straight, 17 split, 11 street, 8 corner, 5 six-line, 2 dozen/column, 1 even-money). */
  multiplier: z.coerce.number().int().min(1).max(65535).default(35),
  /** Net liability already reserved in the current round (chip units). */
  existingLiability: z.coerce.number().nonnegative().default(0),
});

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if ("response" in q) return q.response;
  const r = getMaximumSafeBet(demoTreasury, q.data.multiplier, q.data.existingLiability);
  const byKind = Object.fromEntries(Object.entries(PAYOUT).map(([kind, m]) => [kind, getMaximumSafeBet(demoTreasury, m).maxStake]));
  return ok(
    {
      multiplier: q.data.multiplier,
      existingLiability: q.data.existingLiability,
      ...r,
      reason: r.reason ?? null,
      maxStakeByKind: byKind,
      formula: "maxStake = floor((availableBankroll * exposureCap - existingLiability) / multiplier, 2dp)",
    },
    { maxAge: 10 },
  );
}
