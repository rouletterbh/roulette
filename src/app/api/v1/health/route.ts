import { API_VERSION, DEMO, ok, OPTIONS } from "@/lib/agent/envelope";
import { chainInfo } from "@/lib/agent/snapshot";
import { deployedContracts } from "@/lib/agent/intents";
import { siteConfig } from "@/config/site";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { chainHealth } from "@/lib/agent/chain-api";

export const dynamic = "force-dynamic";
export { OPTIONS };

export async function GET() {
  if (CHAIN_BACKED) return chainHealth(getChainReader());
  const contracts = deployedContracts();
  return ok(
    {
      status: "ok",
      version: API_VERSION,
      product: siteConfig.name,
      network: "Robinhood Chain",
      chain: chainInfo(),
      demoMode: DEMO,
      contractsDeployed: Object.values(contracts).every(Boolean),
      contracts,
      capabilities: ["read", "verify", "quote", "intents"],
      signing: "never: write routes return unsigned transaction intents for the agent's own wallet",
      links: { openapi: "/api/v1/openapi.json", datasets: "/api/v1/datasets", docs: "/developers", site: siteConfig.url, x: siteConfig.socials.x.href },
    token: { name: siteConfig.token.name, symbol: siteConfig.token.symbol, chainId: siteConfig.token.chainId, note: "project token; not required to play and not a reward asset" },
      time: new Date().toISOString(),
    },
    { maxAge: 15 },
  );
}
