import { z } from "zod";
import { err, ok, OPTIONS, parseQuery } from "@/lib/agent/envelope";
import { roundStats } from "@/lib/demo/rounds";
import { demoTables } from "@/lib/demo/data";

export const dynamic = "force-dynamic";
export { OPTIONS };

const Query = z.object({
  table: z.string().min(1).max(64).optional(),
  window: z.coerce.number().int().min(1).max(480).default(100),
});

export async function GET(req: Request) {
  const q = parseQuery(req, Query);
  if ("response" in q) return q.response;
  if (q.data.table && !demoTables.some((t) => t.id === q.data.table)) return err("NOT_FOUND", `Unknown table "${q.data.table}"`);
  const stats = roundStats(q.data.table, q.data.window);
  return ok(
    {
      ...stats,
      /** Expected shares on a single-zero wheel, for reference only. */
      expected: { red: 18 / 37, black: 18 / 37, green: 1 / 37, odd: 18 / 37, even: 18 / 37, dozen: 12 / 37, column: 12 / 37, pocket: 1 / 37 },
      note: "Descriptive counts of settled rounds. Every spin is independent; past results carry no information about future results.",
    },
    { maxAge: 10 },
  );
}
