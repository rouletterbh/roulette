import { NextResponse } from "next/server";
import { rewardRegistry } from "@/config/tokens";
import { getTokenPrices } from "@/lib/prices/coingecko";
import { CHAIN_BACKED } from "@/lib/agent/mode";
import { getChainReader } from "@/lib/web3/server";
import { chainPrices } from "@/lib/agent/chain-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prices for reward assets.
 *   demo mode on : reference prices from CoinGecko (what the operator relays), as before.
 *   demo mode off: the posted on-chain oracle is the only source; CoinGecko is never called.
 */
export async function GET() {
  if (CHAIN_BACKED) return chainPrices(getChainReader());
  const assets = rewardRegistry.filter((t) => t.contractAddress);
  const prices = await getTokenPrices(assets.map((t) => t.contractAddress!));
  const data = assets.map((t) => {
    const q = prices[t.contractAddress!.toLowerCase()];
    return { id: t.id, symbol: t.symbol, contractAddress: t.contractAddress, priceUsd: q?.usd ?? t.referencePriceUsd ?? null, updatedAt: q?.updatedAt ?? null, source: q ? "coingecko" : t.referencePriceUsd != null ? "reference-snapshot" : null, oracle: t.priceOracle };
  });
  return NextResponse.json({ ok: true, demo: process.env.NEXT_PUBLIC_DEMO_MODE !== "false", data }, { headers: { "cache-control": "public, max-age=30", "access-control-allow-origin": "*" } });
}
