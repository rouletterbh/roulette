import "server-only";

/**
 * Reference USD prices for Robinhood Chain reward assets, read server-side from
 * CoinGecko (platform id "robinhood"). Free tier allows one contract per request,
 * so we fetch sequentially and cache in-process for 60s. Never called from the client.
 */
export interface PriceQuote {
  address: string;
  usd: number;
  updatedAt: number; // unix seconds
  source: "coingecko";
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; quote: PriceQuote | null }>();

export async function getTokenPrice(address: string): Promise<PriceQuote | null> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.quote;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/robinhood?contract_addresses=${key}&vs_currencies=usd&include_last_updated_at=true`,
      { headers: { accept: "application/json", "user-agent": "roblette/1.0" }, next: { revalidate: 60 } },
    );
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number; last_updated_at?: number }>;
    const row = json[key];
    const quote: PriceQuote | null = row?.usd ? { address: key, usd: row.usd, updatedAt: row.last_updated_at ?? Math.floor(Date.now() / 1000), source: "coingecko" } : null;
    cache.set(key, { at: Date.now(), quote });
    return quote;
  } catch {
    cache.set(key, { at: Date.now(), quote: hit?.quote ?? null });
    return hit?.quote ?? null;
  }
}

export async function getTokenPrices(addresses: string[]): Promise<Record<string, PriceQuote | null>> {
  const out: Record<string, PriceQuote | null> = {};
  for (const a of addresses) out[a.toLowerCase()] = await getTokenPrice(a);
  return out;
}
