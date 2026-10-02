import { z } from "zod";
import { ok, OPTIONS, parseQuery, err } from "@/lib/agent/envelope";
import { listDemoRounds } from "@/lib/demo/rounds";
import { demoTables } from "@/lib/demo/data";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().positive().optional(),
  table: z.string().min(1).max(64).optional(),
});

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if ("response" in q) return q.response;
  if (q.data.table && !demoTables.some((t) => t.id === q.data.table)) return err("NOT_FOUND", `Unknown table "${q.data.table}"`);
  const page = listDemoRounds(q.data);
  return ok(
    {
      rounds: page.rounds,
      nextCursor: page.nextCursor,
      total: page.total,
      proof: "result = keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ uint256(roundId)) mod 37; commitment = keccak256(serverSeed)",
    },
    { maxAge: 10 },
  );
}
