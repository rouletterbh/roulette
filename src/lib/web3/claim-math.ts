/**
 * Claim parameters shared by the browser cashier (src/lib/web3/actions.ts) and the
 * server-side claim intent (src/lib/agent/chain-api.ts), so both derive `minOut` and
 * the deadline the same way. Pure; no wallet or network imports.
 */

/** Default slippage tolerance for a claim, in bps (0.5%). */
export const CLAIM_SLIPPAGE_BPS = 50;
/** Default claim deadline, minutes from now. */
export const CLAIM_DEADLINE_MINUTES = 10;

/** minOut for a quote with `slippageBps` tolerance. */
export function withSlippage(amountOut: bigint, slippageBps = CLAIM_SLIPPAGE_BPS): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Unix-seconds deadline `minutes` from `nowMs`. */
export function deadlineIn(minutes = CLAIM_DEADLINE_MINUTES, nowMs = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 1000) + minutes * 60);
}

/* ------------------------------------------------------------ collect flow */

/**
 * The reward ("Collect") flow is two transactions:
 *   1. CasinoTreasury.convertToRewards(ids, amounts): burns chips, credits
 *      units × chipUsdValue (USD 1e18) to RewardVault.winBalance. One-way.
 *   2. RewardVault.claimAs(asset, usd, minOut, deadline): pays the asset from the
 *      vault's inventory at the posted price.
 * These helpers mirror the contracts' integer maths so the cashier and the API state
 * exactly what the chain would do, and never more than the vault holds.
 */

/** USD (1e18) credited for converting `units` chips: `units × chipUsdValue`, as in CasinoTreasury.convertToRewards. */
export function convertCreditUsd1e18(units: bigint | number, chipUsdValue: bigint): bigint {
  const u = typeof units === "bigint" ? units : BigInt(Math.max(0, Math.floor(units)));
  return u > 0n && chipUsdValue > 0n ? u * chipUsdValue : 0n;
}

/** ETH (wei) that moves to the treasury's `claimable` earmark for `units` chips: `units × chipPriceWei`. */
export function convertBackingWei(units: bigint | number, chipPriceWei: bigint): bigint {
  const u = typeof units === "bigint" ? units : BigInt(Math.max(0, Math.floor(units)));
  return u > 0n && chipPriceWei > 0n ? u * chipPriceWei : 0n;
}

/** Largest USD (1e18) the vault's `inventory` (token base units) can pay at `priceUsd1e18`: floor(inventory × price / 10^decimals). */
export function inventoryValueUsd1e18(inventory: bigint, priceUsd1e18: bigint, decimals: number): bigint {
  if (inventory <= 0n || priceUsd1e18 <= 0n) return 0n;
  return (inventory * priceUsd1e18) / 10n ** BigInt(decimals);
}

/** RewardVault.quote: token base units for `usd1e18` at `priceUsd1e18`. */
export function tokensForUsd(usd1e18: bigint, priceUsd1e18: bigint, decimals: number): bigint {
  if (usd1e18 <= 0n || priceUsd1e18 <= 0n) return 0n;
  return (usd1e18 * 10n ** BigInt(decimals)) / priceUsd1e18;
}

export type ClaimBlocker =
  /** Not registered on the vault, or registered and switched off. */
  | "not-enabled"
  /** No posted price inside the vault's staleness window. */
  | "no-price"
  /** The vault holds none of the asset. */
  | "no-inventory"
  /** The caller has no win balance. */
  | "no-balance"
  /** Something is claimable, but less than the vault's minimum payout for the asset. */
  | "below-minimum";

export interface ClaimLimitInput {
  winBalanceUsd1e18: bigint;
  /** Vault inventory, token base units. */
  inventory: bigint;
  /** Fresh oracle price (USD 1e18); null / undefined / 0 when stale or unset. */
  priceUsd1e18: bigint | null | undefined;
  decimals: number;
  minimumPayoutUsd1e18: bigint;
  /** Registered on the vault and enabled. */
  enabled: boolean;
}

export interface ClaimLimit {
  /** min(win balance, inventory × price): the most claimAs would pay right now. 0 when blocked. */
  maxUsd1e18: bigint;
  /** What the vault's inventory is worth at the posted price (0 without a price). */
  inventoryUsd1e18: bigint;
  /** Which side caps the claim. */
  limitedBy: "win-balance" | "inventory" | null;
  /** Why nothing can be claimed; null when `maxUsd1e18` is claimable. */
  blocker: ClaimBlocker | null;
}

/**
 * The maximum a wallet can claim of one asset right now, from chain values only:
 * min(win balance, inventory × price), and the reason when that is nothing. The order of
 * the blockers follows what a caller can act on: asset state first, then their balance.
 */
export function claimLimit(i: ClaimLimitInput): ClaimLimit {
  const price = i.priceUsd1e18 ?? 0n;
  const inventoryUsd1e18 = inventoryValueUsd1e18(i.inventory, price, i.decimals);
  const none = (blocker: ClaimBlocker): ClaimLimit => ({ maxUsd1e18: 0n, inventoryUsd1e18, limitedBy: null, blocker });
  if (!i.enabled) return none("not-enabled");
  if (price <= 0n) return none("no-price");
  if (i.inventory <= 0n) return none("no-inventory");
  if (i.winBalanceUsd1e18 <= 0n) return none("no-balance");
  const byInventory = inventoryUsd1e18 < i.winBalanceUsd1e18;
  const maxUsd1e18 = byInventory ? inventoryUsd1e18 : i.winBalanceUsd1e18;
  const limitedBy = byInventory ? ("inventory" as const) : ("win-balance" as const);
  if (maxUsd1e18 < i.minimumPayoutUsd1e18 || tokensForUsd(maxUsd1e18, price, i.decimals) === 0n) return { maxUsd1e18: 0n, inventoryUsd1e18, limitedBy, blocker: "below-minimum" };
  return { maxUsd1e18, inventoryUsd1e18, limitedBy, blocker: null };
}

/**
 * Peg coverage of a conversion. A win balance is USD at the chip peg while its backing is
 * ETH at the chip price, so a converted chip is covered by `chipPriceWei × ETH/USD` of
 * claimable ETH against `chipUsdValue` of liability. Returns bps (10_000 = fully covered).
 */
export function pegCoverageBps(chipPriceWei: bigint, chipUsdValue: bigint, ethUsd1e18: bigint): number {
  if (chipUsdValue <= 0n) return 0;
  return Number((chipPriceWei * ethUsd1e18 * 10_000n) / (chipUsdValue * 10n ** 18n));
}
