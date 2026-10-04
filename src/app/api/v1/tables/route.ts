import { ok, OPTIONS } from "@/lib/agent/envelope";
import { listTables } from "@/lib/agent/snapshot";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { chainTables } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET() {
  if (CHAIN_BACKED) return chainTables(getChainReader());
  const tables = listTables();
  return ok({ tables, count: tables.length }, { maxAge: 10 });
}
