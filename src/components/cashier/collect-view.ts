import { formatUnits, parseUnits } from "viem";
import { claimLimit, type ClaimBlocker, type ClaimLimit } from "@/lib/web3/claim-math";

/**
 * Pure view logic for the cashier's two-step collect flow (convert chips → claim as an
 * asset). Everything is derived from chain reads; no copy here promises more than the
 * vault's own inventory at the posted price.
 */

export const RESTOCK_NOTE = "Vault inventory is being restocked: conversions are fulfilled in batches.";

/** Registry id of the project token (src/config/tokens.ts). */
export const PROJECT_TOKEN_ID = "crypto-rbl";

/** One sentence under "Claim as": how RBL gets into the vault. Factual, no price or value talk. */
export const PROJECT_TOKEN_NOTE = "Winnings can be collected as RBL, the project token, at the oracle price, from vault inventory that is bought on its launch curve with the ETH players convert.";

/**
 * The asset to preselect when nothing has been picked: the project token, but only while the vault can
 * actually pay a claim in it. Otherwise nothing is preselected (the player chooses).
 */
export function defaultAssetId(rows: ReadonlyArray<{ id: string; claimable: boolean }>): string | null {
  const rbl = rows.find((r) => r.id === PROJECT_TOKEN_ID);
  return rbl?.claimable ? rbl.id : null;
}

export interface CollectAssetInput {
  symbol: string;
  enabled: boolean;
  decimals: number;
  inventory: bigint;
  minimumPayoutUsd1e18: bigint;
  priceUsd1e18: bigint | null;
}

/**
 * USD (1e18) as dollars and cents, rounded DOWN: a maximum of $1.6388 reads "$1.63", never
 * "$1.64", so no label states more than the vault can pay.
 */
export function usdFloor(v: bigint): string {
  const cents = (v > 0n ? v : 0n) / 10n ** 16n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}
const usd = usdFloor;

/** Why an asset cannot be claimed right now, in the player's terms. */
export function blockerCopy(blocker: ClaimBlocker, limit: ClaimLimit, a: CollectAssetInput): string {
  switch (blocker) {
    case "not-enabled":
      return "Not enabled for claims on the vault.";
    case "no-price":
      return "No fresh price posted. Claims resume when the oracle updates.";
    case "no-inventory":
      return RESTOCK_NOTE;
    case "no-balance":
      return `No win balance yet. Convert chips above; the vault can pay up to ${usd(limit.inventoryUsd1e18)} of ${a.symbol} right now.`;
    case "below-minimum":
      return limit.limitedBy === "inventory"
        ? `The vault holds ${usd(limit.inventoryUsd1e18)} of ${a.symbol}, under the ${usd(a.minimumPayoutUsd1e18)} minimum claim. ${RESTOCK_NOTE}`
        : `Your win balance is under the ${usd(a.minimumPayoutUsd1e18)} minimum claim for ${a.symbol}.`;
  }
}

export interface CollectRow {
  limit: ClaimLimit;
  claimable: boolean;
  /** One line under the symbol: the maximum claimable now, or the reason there is none. */
  line: string;
}

export function collectRow(a: CollectAssetInput, winBalanceUsd1e18: bigint): CollectRow {
  const limit = claimLimit({ winBalanceUsd1e18, inventory: a.inventory, priceUsd1e18: a.priceUsd1e18, decimals: a.decimals, minimumPayoutUsd1e18: a.minimumPayoutUsd1e18, enabled: a.enabled });
  if (limit.blocker) return { limit, claimable: false, line: blockerCopy(limit.blocker, limit, a) };
  return {
    limit,
    claimable: true,
    line: limit.limitedBy === "inventory" ? `Up to ${usd(limit.maxUsd1e18)} now (limited by vault inventory; the rest waits for a restock)` : `Up to ${usd(limit.maxUsd1e18)} now (your whole win balance)`,
  };
}

/**
 * The USD (1e18) a claim form asks for: empty input means the maximum; anything typed is
 * clamped to the maximum. `error` explains an amount that cannot be claimed.
 */
export function claimAmount(input: string, maxUsd1e18: bigint, minimumPayoutUsd1e18: bigint): { usd1e18: bigint; error: string | null } {
  const text = input.trim();
  if (text === "") return { usd1e18: maxUsd1e18, error: maxUsd1e18 > 0n ? null : "Nothing claimable right now." };
  if (!/^\d*(\.\d{0,18})?$/.test(text) || text === ".") return { usd1e18: 0n, error: "Enter a USD amount." };
  const want = parseUnits(text.startsWith(".") ? `0${text}` : text, 18);
  if (want <= 0n) return { usd1e18: 0n, error: "Enter a USD amount." };
  if (want > maxUsd1e18) return { usd1e18: maxUsd1e18, error: `The most claimable right now is ${usd(maxUsd1e18)}.` };
  if (want < minimumPayoutUsd1e18) return { usd1e18: want, error: `The minimum claim is ${usd(minimumPayoutUsd1e18)}.` };
  return { usd1e18: want, error: null };
}

/** "45s", "3m", "2h": age of the posted price. */
export function ageLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** Whole-token display of a base-unit amount, at most 4 decimals, never rounded up past what was paid. */
export function tokenLabel(amount: bigint, decimals: number): string {
  const n = Number(formatUnits(amount, decimals));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: n >= 100 ? 2 : 4, roundingMode: "floor" } as Intl.NumberFormatOptions).format(n);
}
