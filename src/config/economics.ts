/**
 * Treasury split + risk configuration. These are DEFAULTS, exposed for
 * admin/governance adjustment within the safe bounds declared below.
 * Nothing here is "economic truth".
 */
export const economicsDefaults = {
  /** Share of every deposit routed to payout liquidity. */
  payoutLiquidityBps: 7000,
  /** Share routed to reward inventory purchases. */
  rewardInventoryBps: 2000,
  /** Share held as protocol operating reserve. */
  protocolReserveBps: 800,
  /** Optional platform fee. */
  platformFeeBps: 200,
  /** Fraction of liquidity never exposed to a single round. */
  safetyReserveBps: 1500,
  /** Hard cap on single-round liability as share of available bankroll. */
  maxRoundExposureBps: 2500,
  /** Minimum bankroll before a table can open at all (USD-equivalent). */
  minBankrollToOpen: 25,
} as const;

export const economicsBounds = {
  payoutLiquidityBps: [5000, 9000],
  rewardInventoryBps: [0, 4000],
  protocolReserveBps: [0, 2000],
  platformFeeBps: [0, 500],
  safetyReserveBps: [500, 5000],
  maxRoundExposureBps: [500, 5000],
} as const;

export type EconomicsConfig = { -readonly [K in keyof typeof economicsDefaults]: number };

export function validateEconomics(cfg: EconomicsConfig): string[] {
  const errors: string[] = [];
  const total =
    cfg.payoutLiquidityBps + cfg.rewardInventoryBps + cfg.protocolReserveBps + cfg.platformFeeBps;
  if (total !== 10000) errors.push(`Deposit split must total 10000 bps, got ${total}`);
  for (const [k, [lo, hi]] of Object.entries(economicsBounds)) {
    const v = cfg[k as keyof typeof economicsBounds];
    if (v < lo || v > hi) errors.push(`${k} ${v} outside [${lo}, ${hi}]`);
  }
  return errors;
}
