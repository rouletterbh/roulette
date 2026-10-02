import { err, ok, OPTIONS } from "@/lib/agent/envelope";
import { getTable } from "@/lib/agent/snapshot";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const table = getTable(id);
  if (!table) return err("NOT_FOUND", `Unknown table "${id}"`);
  return ok({ table }, { maxAge: 10 });
}
