/**
 * Pure maths for the price relay's per-asset sources (no I/O, unit-tested).
 *
 *   coingecko   USD price straight from CoinGecko's token_price endpoint (CASHCAT, PONS, AI).
 *   pons-curve  marginal price of a token that trades only on a Pons V2 launch curve:
 *                 ETH per token = quoteReserve / tokenReserve   (constant product, pre-graduation)
 *                 USD per token = ETH per token × ETH/USD       (ETH/USD from CoinGecko)
 *               Everything is bigint at 1e18 so the script and the tests agree exactly.
 *
 * Sanity bounds: a curve read that implies an absurd fully diluted value is never posted. The
 * cap protects the oracle (and every claim priced from it) from a bad reserve read, a wrong
 * curve address or a wrong ETH/USD figure; the floor catches a zero or dust price.
 */

export const E18 = 10n ** 18n;

export type PriceSource = "coingecko" | "pons-curve";

export interface RelayAsset {
  symbol: string;
  address: string;
  source: PriceSource;
}

/** Implied FDV must sit inside [MIN, MAX] USD or the price is skipped and logged. */
export const FDV_MIN_USD_1E18 = 100n * E18;
export const FDV_MAX_USD_1E18 = 1_000_000_000n * E18;

/** Marginal curve price in ETH per whole token, 1e18 fixed: quoteReserve × 1e18 ÷ tokenReserve. */
export function curvePriceEth1e18(quoteReserve: bigint, tokenReserve: bigint): bigint {
  if (quoteReserve <= 0n || tokenReserve <= 0n) return 0n;
  return (quoteReserve * E18) / tokenReserve;
}

/** USD per whole token (1e18) from an ETH price (1e18) and ETH/USD (1e18). */
export function ethToUsd1e18(priceEth1e18: bigint, ethUsd1e18: bigint): bigint {
  if (priceEth1e18 <= 0n || ethUsd1e18 <= 0n) return 0n;
  return (priceEth1e18 * ethUsd1e18) / E18;
}

/** Fully diluted value in USD (1e18): price × total supply in whole tokens. */
export function impliedFdvUsd1e18(priceUsd1e18: bigint, totalSupply: bigint, decimals: number): bigint {
  if (priceUsd1e18 <= 0n || totalSupply <= 0n) return 0n;
  return (priceUsd1e18 * totalSupply) / 10n ** BigInt(decimals);
}

export interface SanityInput {
  priceUsd1e18: bigint;
  totalSupply: bigint;
  decimals: number;
  minFdvUsd1e18?: bigint;
  maxFdvUsd1e18?: bigint;
}

export type Sanity = { ok: true; fdvUsd1e18: bigint } | { ok: false; fdvUsd1e18: bigint; reason: string };

/** Refuse a zero price and an implied FDV outside [min, max]. */
export function priceSanity(i: SanityInput): Sanity {
  const min = i.minFdvUsd1e18 ?? FDV_MIN_USD_1E18;
  const max = i.maxFdvUsd1e18 ?? FDV_MAX_USD_1E18;
  const fdvUsd1e18 = impliedFdvUsd1e18(i.priceUsd1e18, i.totalSupply, i.decimals);
  if (i.priceUsd1e18 <= 0n) return { ok: false, fdvUsd1e18, reason: "zero price" };
  if (i.totalSupply <= 0n) return { ok: false, fdvUsd1e18, reason: "zero total supply" };
  if (fdvUsd1e18 < min) return { ok: false, fdvUsd1e18, reason: `implied FDV ${fmtUsd(fdvUsd1e18)} is below the ${fmtUsd(min)} floor` };
  if (fdvUsd1e18 > max) return { ok: false, fdvUsd1e18, reason: `implied FDV ${fmtUsd(fdvUsd1e18)} is above the ${fmtUsd(max)} cap` };
  return { ok: true, fdvUsd1e18 };
}

/** "$1,234.56" from USD 1e18 (two decimals, rounded down). */
export function fmtUsd(usd1e18: bigint): string {
  const cents = usd1e18 / 10n ** 16n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/**
 * Parse the ASSETS env override: a comma list of `0xaddr` or `0xaddr:pons-curve` (or `:coingecko`).
 * A bare address keeps the default source (coingecko). Symbols are the first 8 characters of the
 * address unless the address is one of `known`, whose symbol is reused.
 */
export function parseAssetsEnv(spec: string | undefined, defaults: readonly RelayAsset[]): RelayAsset[] {
  if (!spec || !spec.trim()) return [...defaults];
  const known = new Map(defaults.map((d) => [d.address.toLowerCase(), d]));
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [address, rawSource] = part.split(":").map((s) => s.trim());
      if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) throw new Error(`ASSETS: "${part}" is not a 0x address`);
      const source = (rawSource ?? "coingecko").toLowerCase();
      if (source !== "coingecko" && source !== "pons-curve") throw new Error(`ASSETS: unknown source "${rawSource}" in "${part}" (coingecko | pons-curve)`);
      const hit = known.get(address!.toLowerCase());
      return { symbol: hit?.symbol ?? address!.slice(0, 8), address: address!, source };
    });
}
