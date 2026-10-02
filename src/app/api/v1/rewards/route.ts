import { ok, OPTIONS } from "@/lib/agent/envelope";
import { rewardsSnapshot } from "@/lib/agent/snapshot";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET() {
  return ok(rewardsSnapshot(), { maxAge: 30 });
}
