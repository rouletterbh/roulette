import type { Address, Hex } from "viem";
import type { ContractBet } from "@/lib/agent/encode-bets";
import type { ChainRoundStatus, ChipBalances } from "@/lib/web3/contracts";

/**
 * Everything the agent runner needs from the chain, as an interface, so the state
 * machine in runner.ts is tested against an in-memory chain and runs in the browser
 * against viem (viem-io.ts). Reads never throw for "nothing there"; they throw only
 * when the chain could not be read. Writes simulate first, then broadcast, and resolve
 * with the transaction hash; the runner tracks the receipt itself.
 */
export interface AgentSnapshot {
  chips: ChipBalances;
  chipUnits: number;
  escrow: bigint;
  eth: bigint;
  /** Chip1155.isApprovedForAll(agent, treasury). */
  approved: boolean;
  winBalance: bigint;
  gasPrice: bigint;
}

export interface AgentRound {
  roundId: bigint;
  tableId: number;
  status: ChainRoundStatus;
  /** Meaningful only when settled. */
  result: number;
  /** Unix seconds. */
  openedAt: number;
  betCount: number;
  /** The round's current treasury reservation, added back to "available" for the exposure check. */
  reservedUnits: bigint;
}

export interface AgentRoundBet {
  player: Address;
  numbersMask: bigint;
  multiplier: number;
  stake: bigint;
}

export interface TableLimits {
  availableUnits: bigint;
  exposureBps: number;
  minStake: bigint;
  maxStake: bigint;
  maxBetsPerRound: number;
  active: boolean;
  gameplayPaused: boolean;
}

export type ReceiptState = "success" | "reverted" | "pending";

export interface AgentChainIO {
  readonly agent: Address;
  snapshot(): Promise<AgentSnapshot>;
  /** Latest round opened on the table, or null when none is known in the scan window. */
  currentRound(tableId: number): Promise<AgentRound | null>;
  round(roundId: bigint): Promise<AgentRound>;
  bets(roundId: bigint): Promise<AgentRoundBet[]>;
  limits(tableId: number): Promise<TableLimits>;
  /** Settled results for the table, newest first. */
  recentResults(tableId: number, limit: number): Promise<number[]>;
  commitment(roundId: bigint): Promise<Hex | null>;

  approveTreasury(): Promise<Hex>;
  enterTable(ids: readonly bigint[], amounts: readonly bigint[]): Promise<Hex>;
  /** eth_call of placeBets. Throws ContractRejected when the contract would revert; any other error is a read failure. */
  simulateBets(roundId: bigint, bets: readonly ContractBet[]): Promise<void>;
  placeBets(roundId: bigint, bets: readonly ContractBet[]): Promise<Hex>;
  leaveTable(units: bigint): Promise<Hex>;
  transferChips(to: Address, ids: readonly bigint[], amounts: readonly bigint[]): Promise<Hex>;
  /** Send the whole ETH balance minus the fee for that transfer. Null when the balance cannot pay for its own transfer. */
  sweepEth(to: Address): Promise<{ hash: Hex; value: bigint } | null>;

  /** Non-blocking receipt lookup. */
  receipt(hash: Hex): Promise<ReceiptState>;
  /** Wait for inclusion. Throws when the chain cannot be read or the wait times out. */
  wait(hash: Hex): Promise<Exclude<ReceiptState, "pending">>;
}

/** The contract would reject this bet (risk cap, stake range, round not open, …). Nothing was sent. */
export class ContractRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractRejected";
  }
}

/** The agent wallet cannot pay for the transaction. */
export class OutOfGas extends Error {
  constructor(message = "The agent wallet does not hold enough ETH for gas.") {
    super(message);
    this.name = "OutOfGas";
  }
}
