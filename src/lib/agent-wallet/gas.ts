import { parseEther } from "viem";

/**
 * Gas budgeting for an agent wallet. Figures are estimates used for two decisions
 * only: what the UI tells the owner a float covers, and when the runner stops
 * betting so it can still pay for its own exit. Fees are always re-estimated by the
 * node when a transaction is actually sent.
 */

/** ETH the owner sends with the chips. Configurable for other gas markets. */
export const AGENT_GAS_FLOAT_WEI = parseEther(process.env.NEXT_PUBLIC_AGENT_GAS_FLOAT_ETH ?? "0.0003");

/**
 * Gas units per agent transaction, rounded up from receipts on Robinhood Chain mainnet
 * (placeBets 309,545 for the first bet of a round, enterTable 101,347, leaveTable 119,263;
 * the L1 data component was under 500 gas on each) and from the e2e runs for the rest
 * (leaveTable up to 196,895 when several denominations are minted back, the chip transfer
 * up to 103,766, setApprovalForAll 46,325).
 */
export const AGENT_GAS_UNITS = {
  approve: 60_000n,
  enter: 130_000n,
  bet: 330_000n,
  leave: 220_000n,
  chipTransfer: 120_000n,
  ethTransfer: 40_000n,
} as const;

/** Headroom on the reserve for the gas price moving between the estimate and the transaction. */
const RESERVE_HEADROOM = 2n;

/** What the runner keeps back to leave the table and return chips and ETH to the owner. */
export function exitReserveWei(gasPrice: bigint): bigint {
  return (AGENT_GAS_UNITS.leave + AGENT_GAS_UNITS.chipTransfer + AGENT_GAS_UNITS.ethTransfer) * gasPrice * RESERVE_HEADROOM;
}

/** What the runner wants in hand before sending one more bet. */
export function betCostWei(gasPrice: bigint): bigint {
  return AGENT_GAS_UNITS.bet * gasPrice * RESERVE_HEADROOM;
}

/** True when the wallet can pay for another bet and still exit afterwards. */
export function canAffordAnotherBet(eth: bigint, gasPrice: bigint): boolean {
  return eth >= betCostWei(gasPrice) + exitReserveWei(gasPrice);
}

/**
 * Roughly how many bet transactions a float pays for at this gas price, after set-up
 * and with the exit reserve kept back. An estimate for the funding screen, not a promise.
 */
export function betsCoveredBy(floatWei: bigint, gasPrice: bigint): number {
  if (gasPrice <= 0n) return 0;
  const setup = (AGENT_GAS_UNITS.approve + AGENT_GAS_UNITS.enter) * gasPrice;
  const rest = floatWei - setup - exitReserveWei(gasPrice) - betCostWei(gasPrice);
  if (rest < 0n) return 0;
  return Number(rest / (AGENT_GAS_UNITS.bet * gasPrice)) + 1;
}

/** "0.0003" style ETH figure without trailing noise. */
export function formatEth(wei: bigint, digits = 6): string {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const unit = 10n ** 18n;
  const whole = v / unit;
  const frac = (v % unit).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}
