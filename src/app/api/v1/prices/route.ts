import { NextResponse } from "next/server";
import { rewardRegistry } from "@/config/tokens";
import { getTokenPrices } from "@/lib/prices/coingecko";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reference prices for registry assets with a contract address. Mirrors what the operator posts to the onchain oracle. */
export async function GET() {
  const assets = rewardRegistry.filter((t) => t.contractAddress);
  const prices = await getTokenPrices(assets.map((t) => t.contractAddress!));
  const data = assets.map((t) => {
    const q = prices[t.contractAddress!.toLowerCase()];
    return { id: t.id, symbol: t.symbol, contractAddress: t.contractAddress, priceUsd: q?.usd ?? t.referencePriceUsd ?? null, updatedAt: q?.updatedAt ?? null, source: q ? "coingecko" : t.referencePriceUsd != null ? "reference-snapshot" : null, oracle: t.priceOracle };
  });
  return NextResponse.json({ ok: true, demo: process.env.NEXT_PUBLIC_DEMO_MODE !== "false", data }, { headers: { "cache-control": "public, max-age=30", "access-control-allow-origin": "*" } });
}
