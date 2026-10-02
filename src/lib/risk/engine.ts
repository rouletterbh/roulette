import { maximumLiability } from "@/lib/roulette/settle";
import type { PlacedBet } from "@/lib/roulette/bets";
import { economicsDefaults } from "@/config/economics";

/**
 * Solvency / risk engine. Mirrors the intended RiskEngine.sol logic so the UI,
 * tests and contracts agree. All values in the same unit (chip units or USD-eq).
 */
export interface TreasurySnapshot {
  /** Total assets held for game payouts. */
  bankroll: number;
  /** Liabilities already reserved for in-flight (unsettled) rounds. */
  reservedLiability: number;
  /** Win balances players can claim but have not yet. */
  claimableRewards: number;
  /** Protocol operating reserve (never used for payouts). */
  protocolReserve: number;
  /** Configured buffer as bps of bankroll kept untouched. */
  safetyReserveBps?: number;
  /** Max single-round exposure as bps of available bankroll. */
  maxRoundExposureBps?: number;
}

export interface SafeBetResult {
  availableBankroll: number;
  safetyReserve: number;
  maxRoundExposure: number;
  /** Max stake for a single bet with the given multiplier. */
  maxStake: number;
  tableOpen: boolean;
  reason?: "insufficient-bankroll" | "exposure-cap";
}

/**
 * Bankroll that can actually back new liabilities right now.
 * availableBankroll = bankroll − reserved − claimable − protocolReserve − safetyReserve
 */
export function availableBankroll(t: TreasurySnapshot) {
  const safety = Math.max(0, t.bankroll * ((t.safetyReserveBps ?? economicsDefaults.safetyReserveBps) / 10_000));
  const available = t.bankroll - t.reservedLiability - t.claimableRewards - t.protocolReserve - safety;
  return { available: Math.max(0, available), safety };
}

/**
 * getMaximumSafeBet(bankroll, outstandingLiability, payoutMultiplier, safetyReserve)
 * The largest stake S such that S * multiplier (net profit owed) <= exposure cap.
 */
export function getMaximumSafeBet(
  t: TreasurySnapshot,
  payoutMultiplier: number,
  existingNetLiability = 0,
): SafeBetResult {
  const { available, safety } = availableBankroll(t);
  const capBps = t.maxRoundExposureBps ?? economicsDefaults.maxRoundExposureBps;
  const maxRoundExposure = available * (capBps / 10_000);
  const headroom = Math.max(0, maxRoundExposure - existingNetLiability);
  if (available < economicsDefaults.minBankrollToOpen) {
    return { availableBankroll: available, safetyReserve: safety, maxRoundExposure, maxStake: 0, tableOpen: false, reason: "insufficient-bankroll" };
  }
  const maxStake = Math.floor((headroom / payoutMultiplier) * 100) / 100;
  return {
    availableBankroll: available,
    safetyReserve: safety,
    maxRoundExposure,
    maxStake,
    tableOpen: maxStake > 0,
    reason: maxStake > 0 ? undefined : "exposure-cap",
  };
}

export interface WagerCheck {
  ok: boolean;
  maxNetPayout: number;
  maxRoundExposure: number;
  availableBankroll: number;
  reason?: string;
}

/**
 * Pre-acceptance invariant:  maximumLiabilityAfterBet <= availableBankroll * exposureCap.
 * Called before EVERY wager. Never accepts an undercollateralized bet.
 */
export function checkWager(t: TreasurySnapshot, bets: readonly PlacedBet[]): WagerCheck {
  const { available } = availableBankroll(t);
  const capBps = t.maxRoundExposureBps ?? economicsDefaults.maxRoundExposureBps;
  const maxRoundExposure = available * (capBps / 10_000);
  const { maxNetPayout } = maximumLiability(bets);
  if (bets.length === 0) return { ok: false, maxNetPayout: 0, maxRoundExposure, availableBankroll: available, reason: "No bets" };
  if (maxNetPayout > maxRoundExposure) {
    return { ok: false, maxNetPayout, maxRoundExposure, availableBankroll: available, reason: "Table limit reached" };
  }
  return { ok: true, maxNetPayout, maxRoundExposure, availableBankroll: available };
}

/** Deposit split per economics config (bps). Returns allocations that sum exactly to amount. */
export function splitDeposit(amount: number, cfg = economicsDefaults) {
  const liquidity = Math.floor(amount * cfg.payoutLiquidityBps) / 10_000;
  const inventory = Math.floor(amount * cfg.rewardInventoryBps) / 10_000;
  const reserve = Math.floor(amount * cfg.protocolReserveBps) / 10_000;
  const fee = Math.round((amount - liquidity - inventory - reserve) * 1e6) / 1e6;
  return { liquidity, inventory, reserve, fee };
}
