import { err, ok, OPTIONS } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { getDemoRound } from "@/lib/demo/rounds";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { chainRound } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (CHAIN_BACKED) {
    // Every distinct id is its own chain read, so this GET is rate limited per client like the POST routes.
    const limited = rateLimit(req, "round", { capacity: 60, refillPerSecond: 2 });
    if (limited) return limited;
    return chainRound(getChainReader(), id);
  }
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
