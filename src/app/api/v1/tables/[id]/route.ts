import { err, ok, OPTIONS } from "@/lib/agent/envelope";
import { getTable } from "@/lib/agent/snapshot";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { chainTable } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (CHAIN_BACKED) return chainTable(getChainReader(), id);
  const table = getTable(id);
  if (!table) return err("NOT_FOUND", `Unknown table "${id}"`);
  return ok({ table }, { maxAge: 10 });
}
