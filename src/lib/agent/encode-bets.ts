import { betFromId, isValidBet, type BetDefinition, type PlacedBet } from "@/lib/roulette/bets";

/**
 * Converts web-app bet definitions into the on-chain `IRiskEngine.Bet` struct:
 *   struct Bet { uint64 numbersMask; uint16 multiplier; uint128 stake; }
 * Bit i of `numbersMask` is pocket i (0..36). Constants mirror contracts/src/RiskEngine.sol.
 */
export interface ContractBet {
  numbersMask: bigint;
  multiplier: number;
  stake: bigint;
}

export const MASK_RED = 0x000000154aad52aan;
export const MASK_BLACK = 0x0000000ab552ad54n;
export const MASK_ODD = 0x0000000aaaaaaaaan;
export const MASK_EVEN = 0x0000001555555554n;
export const MASK_LOW = 0x000000000007fffen;
export const MASK_HIGH = 0x0000001ffff80000n;
export const MASK_DOZEN_1 = 0x0000000000001ffen;
export const MASK_DOZEN_2 = 0x0000000001ffe000n;
export const MASK_DOZEN_3 = 0x0000001ffe000000n;
export const MASK_COLUMN_1 = 0x0000000492492492n;
export const MASK_COLUMN_2 = 0x0000000924924924n;
export const MASK_COLUMN_3 = 0x0000001249249248n;

const UINT64_MAX = (1n << 64n) - 1n;
const UINT16_MAX = 0xffff;
const UINT128_MAX = (1n << 128n) - 1n;

export function numbersToMask(numbers: readonly number[]): bigint {
  let mask = 0n;
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 0 || n > 36) throw new RangeError(`Pocket out of range: ${n}`);
    mask |= 1n << BigInt(n);
  }
  return mask;
}

export function maskToNumbers(mask: bigint): number[] {
  if (mask < 0n || mask > UINT64_MAX) throw new RangeError("Mask must fit in uint64");
  const out: number[] = [];
  for (let i = 0; i <= 36; i++) if ((mask >> BigInt(i)) & 1n) out.push(i);
  return out;
}

/** Formats a mask as the 0x-prefixed 16-hex-digit literal used in RiskEngine.sol. */
export function maskToHex(mask: bigint): `0x${string}` {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

/**
 * Chip-unit stakes on chain are integers (uint128). The web app's risk engine
 * works in the same units, so an integer stake maps 1:1.
 */
export function encodeBet(bet: BetDefinition, stake: number | bigint): ContractBet {
  if (!isValidBet(bet)) throw new Error(`Invalid bet geometry: ${bet.id}`);
  const stakeBig = typeof stake === "bigint" ? stake : BigInt(stake);
  if (typeof stake === "number" && !Number.isInteger(stake)) throw new RangeError("Stake must be an integer number of chip units");
  if (stakeBig <= 0n || stakeBig > UINT128_MAX) throw new RangeError("Stake out of uint128 range");
  if (bet.multiplier < 1 || bet.multiplier > UINT16_MAX) throw new RangeError("Multiplier out of uint16 range");
  return { numbersMask: numbersToMask(bet.numbers), multiplier: bet.multiplier, stake: stakeBig };
}

export function encodePlacedBets(bets: readonly PlacedBet[]): ContractBet[] {
  return bets.map((b) => encodeBet(b, b.stake));
}

export function encodeBetById(betId: string, stake: number | bigint): ContractBet {
  const def = betFromId(betId);
  if (!def) throw new Error(`Unknown bet id: ${betId}`);
  return encodeBet(def, stake);
}

/** JSON-safe view of a contract bet (bigints as decimal strings, mask also as hex). */
export function contractBetToJson(b: ContractBet) {
  return {
    numbersMask: b.numbersMask.toString(),
    numbersMaskHex: maskToHex(b.numbersMask),
    multiplier: b.multiplier,
    stake: b.stake.toString(),
  };
}
