/**
 * Commit–reveal fairness scheme used by the practice/demo engine and mirrored by
 * RandomnessManager.sol. The outcome is derived from:
 *   keccak256(serverSeed ‖ playerSeed ‖ blockReference ‖ roundId) mod 37
 * The server commits hash(serverSeed) BEFORE bets open; the seed is revealed after.
 * Math.random() is never used for outcomes — only WebCrypto randomness for seeds.
 */
import { keccak256, toHex, concatHex, type Hex, hexToBigInt } from "viem";

export interface RoundCommitment {
  roundId: number;
  commitment: Hex; // keccak256(serverSeed)
  playerSeed: Hex;
  createdAt: number;
}

export interface RoundReveal extends RoundCommitment {
  serverSeed: Hex;
  blockReference: Hex; // in demo: pseudo-block hash from timestamp entropy
  result: number;
  verified: boolean;
}

export function randomSeed(bytes = 32): Hex {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return toHex(arr);
}

export function commit(serverSeed: Hex): Hex {
  return keccak256(serverSeed);
}

/** `roundId` is hashed as a uint256, so chain round ids beyond 2^53 can be passed as bigint. */
export function deriveResult(serverSeed: Hex, playerSeed: Hex, blockReference: Hex, roundId: number | bigint): number {
  const h = keccak256(concatHex([serverSeed, playerSeed, blockReference, toHex(BigInt(roundId), { size: 32 })]));
  return Number(hexToBigInt(h) % 37n);
}

export function verifyRound(r: RoundReveal): boolean {
  if (commit(r.serverSeed) !== r.commitment) return false;
  return deriveResult(r.serverSeed, r.playerSeed, r.blockReference, r.roundId) === r.result;
}

/** Creates a new committed round. The server seed must be kept secret until reveal. */
export function createCommitment(roundId: number, playerSeed = randomSeed()): { commitment: RoundCommitment; serverSeed: Hex } {
  const serverSeed = randomSeed();
  return {
    serverSeed,
    commitment: { roundId, commitment: commit(serverSeed), playerSeed, createdAt: Date.now() },
  };
}

export function reveal(c: RoundCommitment, serverSeed: Hex, blockReference: Hex = randomSeed()): RoundReveal {
  const result = deriveResult(serverSeed, c.playerSeed, blockReference, c.roundId);
  const r: RoundReveal = { ...c, serverSeed, blockReference, result, verified: false };
  r.verified = verifyRound(r);
  return r;
}
