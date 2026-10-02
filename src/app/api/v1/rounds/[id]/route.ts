import { err, ok, OPTIONS } from "@/lib/agent/envelope";
import { getDemoRound } from "@/lib/demo/rounds";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return err("VALIDATION_ERROR", "Round id must be a positive integer");
  const round = getDemoRound(Number(id));
  if (!round) return err("NOT_FOUND", `Unknown round ${id}`);
  return ok(
    {
      round,
      verify: {
        endpoint: "/api/v1/verify",
        body: { roundId: round.roundId, commitment: round.commitment, serverSeed: round.serverSeed, playerSeed: round.playerSeed, blockRef: round.blockRef, result: round.result },
      },
    },
    { maxAge: 60 },
  );
}
