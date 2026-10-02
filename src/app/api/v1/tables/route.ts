import { ok, OPTIONS } from "@/lib/agent/envelope";
import { listTables } from "@/lib/agent/snapshot";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET() {
  const tables = listTables();
  return ok({ tables, count: tables.length }, { maxAge: 10 });
}
