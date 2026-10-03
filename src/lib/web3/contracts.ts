import { isAddress, type Abi, type Address } from "viem";
import { chipDenominations, chipTokenIds, type ChipDenomination } from "@/config/tokens";
import { betFromId, type PlacedBet } from "@/lib/roulette/bets";
import { encodeBet, type ContractBet } from "@/lib/agent/encode-bets";
import {
  casinoTreasuryAbi,
  chip1155Abi,
  randomnessManagerAbi,
  rewardVaultAbi,
  riskEngineAbi,
  rouletteGameAbi,
  postedPriceOracleAbi,
  accessControllerAbi,
} from "./abi";

/**
 * Typed contract surface for the web app. Addresses come from `NEXT_PUBLIC_*_ADDRESS`
 * (null when unset or malformed, never guessed). ABIs are the Foundry exports in
 * `./abi/*.json`, re-emitted `as const` by scripts/generate-abi-ts.mjs so wagmi
 * infers function/event/error types.
 */
export { casinoTreasuryAbi, chip1155Abi, randomnessManagerAbi, rewardVaultAbi, riskEngineAbi, rouletteGameAbi, postedPriceOracleAbi, accessControllerAbi };

const env = (v: string | undefined): Address | null => (v && isAddress(v) ? (v as Address) : null);

// Each env var is referenced literally so Next.js inlines it into the client bundle.
export const contractAddresses = {
  treasury: env(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
  chip: env(process.env.NEXT_PUBLIC_CHIP1155_ADDRESS),
  game: env(process.env.NEXT_PUBLIC_ROULETTE_GAME_ADDRESS),
  rewardVault: env(process.env.NEXT_PUBLIC_REWARD_VAULT_ADDRESS),
  randomness: env(process.env.NEXT_PUBLIC_RANDOMNESS_ADDRESS),
  riskEngine: env(process.env.NEXT_PUBLIC_RISK_ENGINE_ADDRESS),
  priceOracle: env(process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS),
  accessController: env(process.env.NEXT_PUBLIC_ACCESS_CONTROLLER_ADDRESS),
} as const;
export type ContractKey = keyof typeof contractAddresses;

/** Addresses required for gameplay. */
export function gameContractsReady() {
  return !!(contractAddresses.treasury && contractAddresses.chip && contractAddresses.game);
}

/** Union of every custom error we may need to decode from a bubbled revert. */
export const allErrorsAbi: Abi = [rouletteGameAbi, casinoTreasuryAbi, chip1155Abi, rewardVaultAbi, riskEngineAbi, randomnessManagerAbi, postedPriceOracleAbi, accessControllerAbi]
  .flatMap((abi) => abi.filter((item) => item.type === "error"))
  .filter((item, i, arr) => arr.findIndex((o) => o.type === "error" && item.type === "error" && o.name === item.name && JSON.stringify(o.inputs) === JSON.stringify(item.inputs)) === i);

/* ----------------------------------------------------------------- chips */

export const CHIP_ID_OFFSET = 1000n;
/** Token ids 1001..1100 in ascending denomination order. */
export const CHIP_IDS = chipDenominations.map((d) => chipTokenIds[d]) as readonly bigint[];
export type ChipBalances = Record<ChipDenomination, bigint>;

export const emptyChipBalances = (): ChipBalances => ({ 1: 0n, 5: 0n, 10: 0n, 25: 0n, 50: 0n, 100: 0n });

export function chipIdToDenomination(id: bigint): ChipDenomination | null {
  const v = Number(id - CHIP_ID_OFFSET);
  return (chipDenominations as readonly number[]).includes(v) ? (v as ChipDenomination) : null;
}

/** Chip units represented by a set of per-denomination counts. */
export function chipUnits(balances: Partial<ChipBalances>): number {
  return chipDenominations.reduce((s, d) => s + d * Number(balances[d] ?? 0n), 0);
}

/** balanceOfBatch output (ordered as CHIP_IDS) → per-denomination counts. */
export function balancesFromBatch(raw: readonly bigint[]): ChipBalances {
  const out = emptyChipBalances();
  chipDenominations.forEach((d, i) => {
    out[d] = raw[i] ?? 0n;
  });
  return out;
}

export interface ChipSelection {
  ids: bigint[];
  amounts: bigint[];
  /** Units actually covered; equals the request when `exact`. */
  units: number;
  exact: boolean;
}

/**
 * Greedy largest-first pick of chips worth `units` from `balances`. When the wallet
 * cannot represent the amount exactly (e.g. 3 units with only 5-chips) the selection
 * covers the largest representable value <= units and `exact` is false.
 */
export function selectChips(balances: Partial<ChipBalances>, units: number): ChipSelection {
  const ids: bigint[] = [];
  const amounts: bigint[] = [];
  let rest = Math.max(0, Math.floor(units));
  for (const d of [...chipDenominations].reverse()) {
    const have = balances[d] ?? 0n;
    if (have === 0n || rest < d) continue;
    const take = BigInt(Math.min(Math.floor(rest / d), Number(have)));
    if (take === 0n) continue;
    ids.push(chipTokenIds[d]);
    amounts.push(take);
    rest -= Number(take) * d;
  }
  const covered = Math.floor(units) - rest;
  return { ids, amounts, units: covered, exact: rest === 0 && units > 0 };
}

/** Every chip in the wallet, as enterTable/redeem arguments. */
export function selectAllChips(balances: Partial<ChipBalances>): ChipSelection {
  return selectChips(balances, chipUnits(balances));
}

/* ------------------------------------------------------------------ bets */

/** `placeBets(roundId, bets)` argument tuple, encoded via encode-bets.ts. */
export function toPlaceBetsArgs(roundId: bigint, bets: readonly PlacedBet[]) {
  const tuples = bets.map((b) => encodeBet(b, b.stake));
  return [roundId, tuples.map((t) => ({ numbersMask: t.numbersMask, multiplier: t.multiplier, stake: t.stake }))] as const;
}

/** Bet-slip entries ({betId → stake}) → ContractBet tuples. Throws on unknown ids. */
export function slipToContractBets(bets: Record<string, number>): ContractBet[] {
  return Object.entries(bets)
    .filter(([, stake]) => stake > 0)
    .map(([id, stake]) => {
      const def = betFromId(id);
      if (!def) throw new Error(`Unknown bet id: ${id}`);
      return encodeBet(def, stake);
    });
}

/* ---------------------------------------------------------------- tables */

/**
 * Chain tables are uint32 ids created by the operator. Web table ids are strings
 * (demo/created tables); numeric ids map 1:1, everything else uses the default table
 * (`NEXT_PUBLIC_CHAIN_TABLE_ID`, table 1 at launch).
 */
export function resolveChainTableId(tableId?: string | null): number {
  if (tableId && /^\d+$/.test(tableId)) {
    const n = Number(tableId);
    if (n > 0 && n < 2 ** 32) return n;
  }
  const d = Number(process.env.NEXT_PUBLIC_CHAIN_TABLE_ID ?? "1");
  return Number.isInteger(d) && d > 0 ? d : 1;
}

/** Blocks scanned backwards for the latest RoundOpened on mount. */
/** Robinhood Chain mints ~10 blocks/s, so 60 000 blocks ≈ 100 minutes of history for the initial log scans. */
export const ROUND_SCAN_BLOCKS = BigInt(process.env.NEXT_PUBLIC_ROUND_SCAN_BLOCKS ?? "60000");
/** Read-polling cadence (ms) for chain state when not in demo mode. */
export const CHAIN_POLL_MS = 4000;
/** The operator's betting window (not on chain); used only for an approximate countdown. */
export const BETTING_WINDOW_SECONDS = Number(process.env.NEXT_PUBLIC_BETTING_SECONDS ?? "45");

export const ROUND_STATUS = { None: 0, Open: 1, Closed: 2, Settled: 3, Voided: 4 } as const;
export type ChainRoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];
export const RANDOMNESS_STATUS = { None: 0, Committed: 1, Locked: 2, Revealed: 3, Void: 4 } as const;

export const PAUSE_FLAGS = { deposits: 1, gameplay: 2, claims: 4, withdrawals: 8 } as const;
