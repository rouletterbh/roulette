import { ok, OPTIONS } from "@/lib/agent/envelope";
import { rewardsSnapshot } from "@/lib/agent/snapshot";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { chainRewards } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET() {
  if (CHAIN_BACKED) return chainRewards(getChainReader());
  return ok(rewardsSnapshot(), { maxAge: 30 });
}
