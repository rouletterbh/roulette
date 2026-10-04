import type { ContractBet } from "@/lib/agent/encode-bets";

/**
 * Integer (chip-unit) mirror of contracts/src/RiskEngine.sol, used by the chain-backed
 * API so a quote agrees with the contract to the unit. All inputs are bigint chip units;
 * divisions floor exactly like Solidity. No I/O.
 */
const BPS = 10_000n;
const POCKETS = 37;

/** RiskEngine.payout: stake × (multiplier + 1). */
export function payoutUnits(stake: bigint, multiplier: number): bigint {
  return stake * (BigInt(multiplier) + 1n);
}

/** RiskEngine.maximumLiability over on-chain bet structs. */
export function maximumLiabilityUnits(bets: readonly ContractBet[]): { worstResult: number; maxReturn: bigint; maxNetPayout: bigint } {
  let totalStaked = 0n;
  for (const b of bets) totalStaked += b.stake;
  let worstResult = 0;
  let maxReturn = 0n;
  for (let pocket = 0; pocket < POCKETS; pocket++) {
    let ret = 0n;
    for (const b of bets) if ((b.numbersMask >> BigInt(pocket)) & 1n) ret += payoutUnits(b.stake, b.multiplier);
    if (ret > maxReturn) {
      maxReturn = ret;
      worstResult = pocket;
    }
  }
  return { worstResult, maxReturn, maxNetPayout: maxReturn > totalStaked ? maxReturn - totalStaked : 0n };
}

/** available × exposureBps ÷ 10 000 (floor). */
export function maxRoundExposureUnits(availableUnits: bigint, exposureBps: number): bigint {
  return (availableUnits * BigInt(exposureBps)) / BPS;
}

/** RiskEngine.maxSafeStake(available, multiplier, existingLiability, exposureBps). */
export function maxSafeStakeUnits(availableUnits: bigint, multiplier: number, existingLiability: bigint, exposureBps: number): bigint {
  if (multiplier <= 0) return 0n;
  const cap = maxRoundExposureUnits(availableUnits, exposureBps);
  const headroom = cap > existingLiability ? cap - existingLiability : 0n;
  return headroom / BigInt(multiplier);
}

export interface WagerCheckUnits {
  ok: boolean;
  worstResult: number;
  maxReturn: bigint;
  maxNetPayout: bigint;
  maxRoundExposure: bigint;
}

/**
 * RiskEngine.checkWager(available, exposureBps, bets) without the geometry validation
 * (callers validate bet ids first). `bets` must be the round's WHOLE bet set and
 * `availableUnits` the treasury's available bankroll plus the round's own reservation,
 * exactly as RouletteGame.placeBets passes them.
 */
export function checkWagerUnits(availableUnits: bigint, exposureBps: number, bets: readonly ContractBet[]): WagerCheckUnits {
  const { worstResult, maxReturn, maxNetPayout } = maximumLiabilityUnits(bets);
  const maxRoundExposure = maxRoundExposureUnits(availableUnits, exposureBps);
  return { ok: bets.length > 0 && maxNetPayout <= maxRoundExposure, worstResult, maxReturn, maxNetPayout, maxRoundExposure };
}
