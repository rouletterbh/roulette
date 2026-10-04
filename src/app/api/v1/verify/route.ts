import { z } from "zod";
import { err, hex32, ok, OPTIONS, parseBody } from "@/lib/agent/envelope";
import { rateLimit } from "@/lib/agent/rate-limit";
import { commit, deriveResult } from "@/lib/fairness/commit-reveal";
import { colorOf } from "@/lib/roulette/constants";

export const dynamic = "force-dynamic";
export { OPTIONS };

const VerifyBodySchema = z.object({
  /** uint256 round id: a JSON integer, or a decimal string for ids beyond 2^53 (chain round ids are uint256). */
  roundId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,78}$/, "Expected a decimal uint256")]),
  commitment: hex32,
  serverSeed: hex32,
  playerSeed: hex32,
  blockRef: hex32,
  result: z.number().int().min(0).max(36).optional(),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "verify");
  if (limited) return limited;
  const body = await parseBody(req, VerifyBodySchema);
  if ("response" in body) return body.response;
  const b = body.data;
  const roundId = BigInt(b.roundId);
  if (roundId >= 1n << 256n) return err("VALIDATION_ERROR", "roundId does not fit in uint256");
  const commitOk = commit(b.serverSeed) === b.commitment;
  const derivedResult = deriveResult(b.serverSeed, b.playerSeed, b.blockRef, roundId);
  const resultOk = b.result === undefined ? null : b.result === derivedResult;
  return ok(
    {
      roundId: b.roundId,
      commitOk,
      derivedResult,
      derivedColor: colorOf(derivedResult),
      resultOk,
      verified: commitOk && resultOk !== false,
      formula: "keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ uint256(roundId)) mod 37",
    },
    // Verification is pure math over caller input (demo or chain rounds alike), never simulated data.
    { demo: false },
  );
}
