import { BaseError, InsufficientFundsError, getAbiItem, type Account, type Address, type Chain, type Hex, type PublicClient, type WalletClient } from "viem";
import type { ContractBet } from "@/lib/agent/encode-bets";
import { CHIP_IDS, PAUSE_FLAGS, ROUND_SCAN_BLOCKS, ROUND_STATUS, balancesFromBatch, casinoTreasuryAbi, chip1155Abi, chipUnits, randomnessManagerAbi, rewardVaultAbi, rouletteGameAbi, type ChainRoundStatus } from "@/lib/web3/contracts";
import { toTxError } from "@/lib/web3/errors";
import { ContractRejected, OutOfGas, type AgentChainIO, type AgentRound, type AgentRoundBet, type AgentSnapshot, type ReceiptState, type TableLimits } from "./chain-io";

/**
 * AgentChainIO over viem. Reads go through a public client on the public RPC; writes
 * are signed locally by the burner account (no wallet prompt) and broadcast through
 * the same RPC. Every write is simulated first, so a revert surfaces before any gas
 * is spent.
 */
export interface AgentContracts {
  game: Address;
  chip: Address;
  treasury: Address;
  randomness?: Address | null;
  rewardVault?: Address | null;
}

export interface ViemIOOptions {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  chain: Chain;
  contracts: AgentContracts;
  /** Blocks scanned backwards for RoundOpened on first use. */
  scanBlocks?: bigint;
  receiptTimeoutMs?: number;
}

const roundOpened = getAbiItem({ abi: rouletteGameAbi, name: "RoundOpened" });
/** Extra gas on the plain ETH transfer of a sweep, so an estimate that is slightly low cannot strand the balance. */
const SWEEP_GAS_BUFFER_BPS = 12_000n;
/** Blocks re-read behind the log cursor on every poll (about 30 s on Robinhood Chain). */
const RESCAN_BLOCKS = 300n;

function insufficientFunds(e: unknown): boolean {
  if (e instanceof BaseError && e.walk((x) => x instanceof InsufficientFundsError)) return true;
  return /insufficient funds|gas required exceeds allowance|max fee per gas.*balance/i.test(e instanceof Error ? e.message : String(e));
}

/** Contract revert → ContractRejected / plain Error with readable copy; funds → OutOfGas; anything else unchanged. */
function classify(e: unknown): unknown {
  if (insufficientFunds(e)) return new OutOfGas();
  const t = toTxError(e);
  if (t.code !== "unknown" && t.code !== "rejected" && t.code !== "wrong-network" && t.code !== "dropped" && t.code !== "timeout") return new ContractRejected(t.message);
  return e;
}

export function createViemAgentIO(o: ViemIOOptions): AgentChainIO {
  const { publicClient: pub, walletClient: wallet, account, chain, contracts: c } = o;
  const agent = account.address;
  const scanBlocks = o.scanBlocks ?? ROUND_SCAN_BLOCKS;

  /** Round ids opened on a table, ascending, plus the block the log scan has reached. */
  const tables = new Map<number, { ids: bigint[]; cursor: bigint }>();
  const settled = new Map<bigint, number | null>(); // final rounds: result, or null when voided

  async function roundIds(tableId: number): Promise<bigint[]> {
    const latest = await pub.getBlockNumber();
    let t = tables.get(tableId);
    const logs = async (from: bigint) => pub.getLogs({ address: c.game, event: roundOpened, args: { tableId }, fromBlock: from, toBlock: latest });
    const add = (found: Awaited<ReturnType<typeof logs>>) => {
      for (const l of found) if (l.args.roundId != null && !t!.ids.includes(l.args.roundId)) t!.ids.push(l.args.roundId);
    };
    if (!t) {
      const from = (span: bigint) => (latest > span ? latest - span : 0n);
      let found;
      try {
        found = await logs(from(scanBlocks));
      } catch {
        found = await logs(from(scanBlocks / 5n)); // RPCs with a tighter getLogs range
      }
      t = { ids: [], cursor: latest };
      tables.set(tableId, t);
      add(found);
    } else if (latest > t.cursor) {
      // Re-read a tail of blocks already scanned: a node that reports block N can still answer
      // getLogs without it for a moment (and load-balanced RPCs disagree about the head).
      const from = t.cursor > RESCAN_BLOCKS ? t.cursor - RESCAN_BLOCKS : 0n;
      add(await logs(from));
      t.cursor = latest;
    }
    t.ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    // Belt and braces: the operator numbers rounds consecutively, so the ids right after the
    // newest known one are read directly. A missed log can then never hide a round for long.
    const last = t.ids[t.ids.length - 1];
    if (last != null) {
      const probes = await Promise.all([1n, 2n, 3n].map((d) => pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "getRound", args: [last + d] }).then((r) => ({ id: last + d, r }))));
      for (const p of probes) if (p.r.status !== ROUND_STATUS.None && p.r.tableId === tableId && !t.ids.includes(p.id)) t.ids.push(p.id);
      t.ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    if (t.ids.length > 400) t.ids.splice(0, t.ids.length - 400);
    return t.ids;
  }

  async function round(roundId: bigint): Promise<AgentRound> {
    const r = await pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "getRound", args: [roundId] });
    const status = r.status as ChainRoundStatus;
    if (status === ROUND_STATUS.Settled) settled.set(roundId, r.result);
    else if (status === ROUND_STATUS.Voided) settled.set(roundId, null);
    return { roundId, tableId: r.tableId, status, result: r.result, openedAt: Number(r.openedAt), betCount: r.betCount, reservedUnits: r.reservedUnits };
  }

  async function write<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw classify(e);
    }
  }

  const betArgs = (roundId: bigint, bets: readonly ContractBet[]) => [roundId, bets.map((b) => ({ numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake }))] as const;

  return {
    agent,

    async snapshot(): Promise<AgentSnapshot> {
      const [raw, escrow, approved, eth, gasPrice, winBalance] = await Promise.all([
        pub.readContract({ abi: chip1155Abi, address: c.chip, functionName: "balanceOfBatch", args: [CHIP_IDS.map(() => agent), [...CHIP_IDS]] }),
        pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "escrow", args: [agent] }),
        pub.readContract({ abi: chip1155Abi, address: c.chip, functionName: "isApprovedForAll", args: [agent, c.treasury] }),
        pub.getBalance({ address: agent }),
        pub.getGasPrice(),
        c.rewardVault ? pub.readContract({ abi: rewardVaultAbi, address: c.rewardVault, functionName: "winBalance", args: [agent] }) : Promise.resolve(0n),
      ]);
      const chips = balancesFromBatch(raw);
      return { chips, chipUnits: chipUnits(chips), escrow, eth, approved, winBalance, gasPrice };
    },

    async currentRound(tableId) {
      const ids = await roundIds(tableId);
      if (ids.length === 0) return null;
      return round(ids[ids.length - 1]);
    },

    round,

    async bets(roundId): Promise<AgentRoundBet[]> {
      const raw = await pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "getBets", args: [roundId] });
      return raw.map((b) => ({ player: b.player, numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake }));
    },

    async limits(tableId): Promise<TableLimits> {
      const [availableUnits, exposureBps, table, maxBets, pauseT, pauseG] = await Promise.all([
        pub.readContract({ abi: casinoTreasuryAbi, address: c.treasury, functionName: "availableBankrollUnits" }),
        pub.readContract({ abi: casinoTreasuryAbi, address: c.treasury, functionName: "maxRoundExposureBps" }),
        pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "tables", args: [tableId] }),
        pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "maxBetsPerRound" }),
        pub.readContract({ abi: casinoTreasuryAbi, address: c.treasury, functionName: "pauseFlags" }),
        pub.readContract({ abi: rouletteGameAbi, address: c.game, functionName: "pauseFlags" }),
      ]);
      return { availableUnits, exposureBps, minStake: table[0], maxStake: table[1], active: table[3], maxBetsPerRound: Number(maxBets), gameplayPaused: ((Number(pauseT) | Number(pauseG)) & PAUSE_FLAGS.gameplay) !== 0 };
    },

    async recentResults(tableId, limit) {
      const ids = await roundIds(tableId);
      const out: number[] = [];
      // Newest first; look a little past `limit` so voided rounds do not shorten the window.
      for (let i = ids.length - 1; i >= 0 && out.length < limit && ids.length - 1 - i < limit * 3; i--) {
        const id = ids[i];
        if (!settled.has(id)) await round(id);
        const result = settled.get(id);
        if (result != null) out.push(result);
      }
      return out;
    },

    async commitment(roundId) {
      if (!c.randomness) return null;
      const r = await pub.readContract({ abi: randomnessManagerAbi, address: c.randomness, functionName: "getRound", args: [roundId] });
      return /^0x0+$/.test(r.commitment) ? null : r.commitment;
    },

    approveTreasury: () =>
      write(async () => {
        const { request } = await pub.simulateContract({ abi: chip1155Abi, address: c.chip, functionName: "setApprovalForAll", args: [c.treasury, true], account });
        return wallet.writeContract({ ...request, account, chain });
      }),

    enterTable: (ids, amounts) =>
      write(async () => {
        const { request } = await pub.simulateContract({ abi: rouletteGameAbi, address: c.game, functionName: "enterTable", args: [[...ids], [...amounts]], account });
        return wallet.writeContract({ ...request, account, chain });
      }),

    async simulateBets(roundId, bets) {
      const [id, tuples] = betArgs(roundId, bets);
      try {
        await pub.simulateContract({ abi: rouletteGameAbi, address: c.game, functionName: "placeBets", args: [id, tuples], account });
      } catch (e) {
        throw classify(e);
      }
    },

    placeBets: (roundId, bets) =>
      write(async () => {
        const [id, tuples] = betArgs(roundId, bets);
        // Not simulated again: the runner simulated this exact call a moment ago, and a second
        // eth_call would only spend more of the betting window.
        return wallet.writeContract({ abi: rouletteGameAbi, address: c.game, functionName: "placeBets", args: [id, tuples], account, chain });
      }),

    leaveTable: (units) =>
      write(async () => {
        const { request } = await pub.simulateContract({ abi: rouletteGameAbi, address: c.game, functionName: "leaveTable", args: [units], account });
        return wallet.writeContract({ ...request, account, chain });
      }),

    transferChips: (to, ids, amounts) =>
      write(async () => {
        const { request } = await pub.simulateContract({ abi: chip1155Abi, address: c.chip, functionName: "safeBatchTransferFrom", args: [agent, to, [...ids], [...amounts], "0x"], account });
        return wallet.writeContract({ ...request, account, chain });
      }),

    async sweepEth(to) {
      const balance = await pub.getBalance({ address: agent });
      if (balance === 0n) return null;
      let gas: bigint;
      try {
        // Estimated with a token value so the estimate itself cannot fail for lack of funds.
        gas = ((await pub.estimateGas({ account: agent, to, value: 1n })) * SWEEP_GAS_BUFFER_BPS) / 10_000n;
      } catch (e) {
        if (insufficientFunds(e)) return null;
        throw e;
      }
      const fees = await pub.estimateFeesPerGas().catch(() => null);
      const maxFeePerGas = fees?.maxFeePerGas ?? (await pub.getGasPrice()) * 2n;
      const maxPriorityFeePerGas = fees?.maxPriorityFeePerGas != null && fees.maxPriorityFeePerGas < maxFeePerGas ? fees.maxPriorityFeePerGas : 0n;
      const fee = gas * maxFeePerGas;
      if (balance <= fee) return null;
      const value = balance - fee;
      try {
        const hash = await wallet.sendTransaction({ account, chain, to, value, gas, maxFeePerGas, maxPriorityFeePerGas });
        return { hash, value };
      } catch (e) {
        if (insufficientFunds(e)) return null; // the fee moved under us; the next sweep recomputes it
        throw e;
      }
    },

    async receipt(hash: Hex): Promise<ReceiptState> {
      try {
        const r = await pub.getTransactionReceipt({ hash });
        return r.status === "success" ? "success" : "reverted";
      } catch (e) {
        if (e instanceof BaseError && /could not be found|not found/i.test(e.shortMessage ?? e.message)) return "pending";
        throw e;
      }
    },

    async wait(hash: Hex) {
      const r = await pub.waitForTransactionReceipt({ hash, confirmations: 1, timeout: o.receiptTimeoutMs ?? 90_000 });
      return r.status === "success" ? "success" : "reverted";
    },
  };
}
