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
