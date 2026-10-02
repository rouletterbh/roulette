import { ok, OPTIONS } from "@/lib/agent/envelope";
import { treasurySnapshot } from "@/lib/agent/snapshot";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET() {
  return ok(treasurySnapshot(), { maxAge: 15 });
}
