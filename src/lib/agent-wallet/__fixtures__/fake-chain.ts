import type { Address, Hex } from "viem";
import type { ContractBet } from "@/lib/agent/encode-bets";
import { ROUND_STATUS, balancesFromBatch, chipUnits, emptyChipBalances, type ChainRoundStatus, type ChipBalances } from "@/lib/web3/contracts";
import { chipDenominations, chipTokenIds, type ChipDenomination } from "@/config/tokens";
import { checkWagerUnits } from "@/lib/risk/units";
import { ContractRejected, OutOfGas, type AgentChainIO, type AgentRound, type AgentRoundBet, type AgentSnapshot, type ReceiptState, type TableLimits } from "../chain-io";

/**
 * In-memory chain for runner tests: one table, the RouletteGame escrow/bet/settle rules
 * the agent depends on, gas accounting, and switches to make any call fail the way an
 * RPC does (before or after the transaction reached the network).
 */
type Method = keyof AgentChainIO;

interface FakeRound {
  id: bigint;
  status: ChainRoundStatus;
  result: number;
  openedAt: number;
  bets: AgentRoundBet[];
  reservedUnits: bigint;
}

export interface FakeChainOptions {
  agent?: Address;
  owner?: Address;
  now?: () => number;
  gasPrice?: bigint;
  /** Gas units charged per transaction. */
  gasPerTx?: bigint;
  availableUnits?: bigint;
  exposureBps?: number;
  minStake?: bigint;
  maxStake?: bigint;
}

export const FAKE_AGENT = "0x00000000000000000000000000000000000A6E17" as Address;
export const FAKE_OWNER = "0x0000000000000000000000000000000000000B0b" as Address;

export class FakeChain implements AgentChainIO {
  readonly agent: Address;
  readonly owner: Address;
  now: () => number;
  gasPrice: bigint;
  gasPerTx: bigint;

  chips: ChipBalances = emptyChipBalances();
  escrow = 0n;
  eth = 0n;
  approved = false;
  winBalance = 0n;
  ownerChips = 0;
  ownerEth = 0n;

  limitsState: TableLimits;
  rounds = new Map<bigint, FakeRound>();
  latest: bigint | null = null;
  history: number[] = [];

  /** Every transaction that reached the network, in order. */
  sent: Array<{ kind: string; roundId?: bigint; hash: Hex; status: "success" | "reverted" }> = [];
  /** Calls made to each method (reads and writes). */
  calls: Partial<Record<Method, number>> = {};
  private failures: Array<{ method: Method; when: "before" | "after"; error: Error; times: number }> = [];
  private receipts = new Map<Hex, ReceiptState>();
  private nonce = 0;
  /** When true, `wait` and `receipt` report pending for new transactions until `mine()` is called. */
  holdReceipts = false;
  private held: Hex[] = [];

  constructor(o: FakeChainOptions = {}) {
    this.agent = o.agent ?? FAKE_AGENT;
    this.owner = o.owner ?? FAKE_OWNER;
    this.now = o.now ?? (() => Date.now());
    this.gasPrice = o.gasPrice ?? 20_000_000n;
    this.gasPerTx = o.gasPerTx ?? 150_000n;
    this.limitsState = { availableUnits: o.availableUnits ?? 1_000n, exposureBps: o.exposureBps ?? 2_500, minStake: o.minStake ?? 1n, maxStake: o.maxStake ?? 500n, maxBetsPerRound: 256, active: true, gameplayPaused: false };
  }

  /** CasinoTreasury.availableBankrollUnits: what is left after every live round's reservation. */
  private available(): bigint {
    let reserved = 0n;
    for (const r of this.rounds.values()) reserved += r.reservedUnits;
    return this.limitsState.availableUnits - reserved;
  }

  /* ----------------------------------------------------------- test controls */

  /** Owner funds the agent: chips (as denominations) and ETH. */
  fund(units: number, eth: bigint) {
    let rest = units;
    for (const d of [...chipDenominations].reverse()) {
      const n = Math.floor(rest / d);
      if (n > 0) {
        this.chips[d as ChipDenomination] += BigInt(n);
        rest -= n * d;
      }
    }
    this.eth += eth;
  }

  /** Make `method` throw. "before": nothing reached the network. "after": the transaction was mined but the caller never learns the hash. */
  fail(method: Method, when: "before" | "after" = "before", error: Error = new Error("HTTP request failed: fetch failed"), times = 1) {
    this.failures.push({ method, when, error, times });
  }

  private take(method: Method, when: "before" | "after"): Error | null {
    const f = this.failures.find((x) => x.method === method && x.when === when);
    if (!f) return null;
    f.times -= 1;
    if (f.times <= 0) this.failures.splice(this.failures.indexOf(f), 1);
    return f.error;
  }

  private count(method: Method) {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
  }

  private read(method: Method) {
    this.count(method);
    const e = this.take(method, "before");
    if (e) throw e;
  }

  openRound(id: bigint, openedAt = Math.floor(this.now() / 1000)) {
    this.rounds.set(id, { id, status: ROUND_STATUS.Open, result: 0, openedAt, bets: [], reservedUnits: 0n });
    this.latest = id;
  }

  /** Someone else's bet in the round. */
  otherBet(id: bigint, bet: ContractBet, player = "0x000000000000000000000000000000000000dEaD" as Address) {
    const r = this.rounds.get(id)!;
    r.bets.push({ player, numbersMask: bet.numbersMask, multiplier: bet.multiplier, stake: bet.stake });
    r.reservedUnits = checkWagerUnits(this.available() + r.reservedUnits, this.limitsState.exposureBps, r.bets).maxNetPayout;
  }

  closeRound(id: bigint) {
    this.rounds.get(id)!.status = ROUND_STATUS.Closed;
  }

  settleRound(id: bigint, result: number) {
    const r = this.rounds.get(id)!;
    r.status = ROUND_STATUS.Settled;
    r.result = result;
    for (const b of r.bets) {
      if (((b.numbersMask >> BigInt(result)) & 1n) === 1n && b.player.toLowerCase() === this.agent.toLowerCase()) this.escrow += b.stake * (BigInt(b.multiplier) + 1n);
    }
    r.reservedUnits = 0n;
    this.history.unshift(result);
  }

  voidRound(id: bigint) {
    const r = this.rounds.get(id)!;
    r.status = ROUND_STATUS.Voided;
    for (const b of r.bets) if (b.player.toLowerCase() === this.agent.toLowerCase()) this.escrow += b.stake;
    r.reservedUnits = 0n;
  }

  /** Release held receipts. */
  mine() {
    for (const h of this.held) this.receipts.set(h, this.sent.find((s) => s.hash === h)?.status ?? "success");
    this.held = [];
  }

  betsSentFor(id: bigint) {
    return this.sent.filter((s) => s.kind === "bet" && s.roundId === id).length;
  }

  /** Total chip units the agent address controls (wallet + escrow). */
  get agentUnits() {
    return chipUnits(this.chips) + Number(this.escrow);
  }

  /* --------------------------------------------------------------- tx engine */

  private async tx(method: Method, kind: string, apply: () => void, roundId?: bigint): Promise<Hex> {
    this.count(method);
    const before = this.take(method, "before");
    if (before) throw before;
    const fee = this.gasPerTx * this.gasPrice;
    if (this.eth < fee) throw new OutOfGas();
    let status: "success" | "reverted" = "success";
    try {
      apply();
    } catch (e) {
      if (e instanceof ContractRejected) status = "reverted";
      else throw e;
    }
    this.eth -= fee;
    const hash = `0x${(++this.nonce).toString(16).padStart(64, "0")}` as Hex;
    this.sent.push({ kind, roundId, hash, status });
    if (this.holdReceipts) {
      this.receipts.set(hash, "pending");
      this.held.push(hash);
    } else {
      this.receipts.set(hash, status);
    }
    const after = this.take(method, "after");
    if (after) throw after;
    return hash;
  }

  private checkBets(roundId: bigint, bets: readonly ContractBet[]) {
    const r = this.rounds.get(roundId);
    if (!r || r.status !== ROUND_STATUS.Open) throw new ContractRejected(`Round ${roundId} is not open. Wait for the next round.`);
    if (this.limitsState.gameplayPaused) throw new ContractRejected("Gameplay is paused.");
    let total = 0n;
    for (const b of bets) {
      if (b.stake < this.limitsState.minStake || b.stake > this.limitsState.maxStake) throw new ContractRejected("Stake outside this table's limits.");
      total += b.stake;
    }
    if (total > this.escrow) throw new ContractRejected(`Not enough chips at the table (need ${total}, have ${this.escrow}).`);
    const all = [...r.bets, ...bets.map((b) => ({ player: this.agent, ...b }))];
    const check = checkWagerUnits(this.available() + r.reservedUnits, this.limitsState.exposureBps, all);
    if (!check.ok) throw new ContractRejected(`Table limit reached: this round would owe up to ${check.maxNetPayout} units against a cap of ${check.maxRoundExposure}.`);
    return { r, total, all, check };
  }

  /* -------------------------------------------------------------------- reads */

  async snapshot(): Promise<AgentSnapshot> {
    this.read("snapshot");
    return { chips: { ...this.chips }, chipUnits: chipUnits(this.chips), escrow: this.escrow, eth: this.eth, approved: this.approved, winBalance: this.winBalance, gasPrice: this.gasPrice };
  }

  private view(r: FakeRound): AgentRound {
    return { roundId: r.id, tableId: 1, status: r.status, result: r.result, openedAt: r.openedAt, betCount: r.bets.length, reservedUnits: r.reservedUnits };
  }

  async currentRound(): Promise<AgentRound | null> {
    this.read("currentRound");
    return this.latest == null ? null : this.view(this.rounds.get(this.latest)!);
  }

  async round(roundId: bigint): Promise<AgentRound> {
    this.read("round");
    const r = this.rounds.get(roundId);
    return r ? this.view(r) : { roundId, tableId: 0, status: ROUND_STATUS.None, result: 0, openedAt: 0, betCount: 0, reservedUnits: 0n };
  }

  async bets(roundId: bigint): Promise<AgentRoundBet[]> {
    this.read("bets");
    return [...(this.rounds.get(roundId)?.bets ?? [])];
  }

  async limits(): Promise<TableLimits> {
    this.read("limits");
    return { ...this.limitsState, availableUnits: this.available() };
  }

  async recentResults(_tableId: number, limit: number): Promise<number[]> {
    this.read("recentResults");
    return this.history.slice(0, limit);
  }

  async commitment(roundId: bigint): Promise<Hex | null> {
    this.read("commitment");
    return `0x${roundId.toString(16).padStart(64, "c")}` as Hex;
  }

  /* ------------------------------------------------------------------- writes */

  approveTreasury() {
    return this.tx("approveTreasury", "approve", () => {
      this.approved = true;
    });
  }

  enterTable(ids: readonly bigint[], amounts: readonly bigint[]) {
    return this.tx("enterTable", "enter", () => {
      if (!this.approved) throw new ContractRejected("The treasury is not approved to move your chips.");
      let units = 0n;
      const next = { ...this.chips };
      ids.forEach((id, i) => {
        const d = chipDenominations.find((x) => chipTokenIds[x] === id);
        if (!d || next[d] < amounts[i]) throw new ContractRejected("Your wallet does not hold enough chips of that denomination.");
        next[d] -= amounts[i];
        units += BigInt(d) * amounts[i];
      });
      this.chips = next;
      this.escrow += units;
    });
  }

  async simulateBets(roundId: bigint, bets: readonly ContractBet[]): Promise<void> {
    this.read("simulateBets");
    this.checkBets(roundId, bets);
  }

  placeBets(roundId: bigint, bets: readonly ContractBet[]) {
    return this.tx(
      "placeBets",
      "bet",
      () => {
        const { r, total, all, check } = this.checkBets(roundId, bets);
        this.escrow -= total;
        r.bets = all;
        r.reservedUnits = check.maxNetPayout;
      },
      roundId,
    );
  }

  leaveTable(units: bigint) {
    return this.tx("leaveTable", "leave", () => {
      if (units === 0n || units > this.escrow) throw new ContractRejected("Not enough chips at the table.");
      this.escrow -= units;
      // mintValue: greedy, largest denomination first
      const raw = chipDenominations.map(() => 0n);
      let rest = Number(units);
      [...chipDenominations].reverse().forEach((d) => {
        const n = Math.floor(rest / d);
        raw[chipDenominations.indexOf(d)] = BigInt(n);
        rest -= n * d;
      });
      const minted = balancesFromBatch(raw);
      for (const d of chipDenominations) this.chips[d] += minted[d];
    });
  }

  transferChips(to: Address, ids: readonly bigint[], amounts: readonly bigint[]) {
    return this.tx("transferChips", "chips", () => {
      if (to.toLowerCase() !== this.owner.toLowerCase()) throw new Error(`chips sent to an unexpected address ${to}`);
      ids.forEach((id, i) => {
        const d = chipDenominations.find((x) => chipTokenIds[x] === id)!;
        if (this.chips[d] < amounts[i]) throw new ContractRejected("Your wallet does not hold enough chips of that denomination.");
        this.chips[d] -= amounts[i];
        this.ownerChips += d * Number(amounts[i]);
      });
    });
  }

  async sweepEth(to: Address): Promise<{ hash: Hex; value: bigint } | null> {
    this.count("sweepEth");
    const before = this.take("sweepEth", "before");
    if (before) throw before;
    if (to.toLowerCase() !== this.owner.toLowerCase()) throw new Error(`ETH sent to an unexpected address ${to}`);
    const fee = this.gasPerTx * this.gasPrice;
    if (this.eth <= fee) return null;
    const value = this.eth - fee;
    this.eth = 0n;
    this.ownerEth += value;
    const hash = `0x${(++this.nonce).toString(16).padStart(64, "0")}` as Hex;
    this.sent.push({ kind: "eth", hash, status: "success" });
    this.receipts.set(hash, "success");
    return { hash, value };
  }

  async receipt(hash: Hex): Promise<ReceiptState> {
    this.read("receipt");
    return this.receipts.get(hash) ?? "pending";
  }

  async wait(hash: Hex): Promise<"success" | "reverted"> {
    this.read("wait");
    const s = this.receipts.get(hash) ?? "pending";
    if (s === "pending") throw new Error("Timed out while waiting for transaction receipt");
    return s;
  }
}
