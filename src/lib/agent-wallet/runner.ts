import type { Address, Hex } from "viem";
import { betFromId } from "@/lib/roulette/bets";
import { slipToContractBets, selectAllChips, ROUND_STATUS } from "@/lib/web3/contracts";
import { checkWagerUnits } from "@/lib/risk/units";
import { betDecisionLabel, decide, evaluateCondition, leashCheck, type AgentBet, type AgentSeat, type ChainBetOutcome } from "@/store/agent-seat";
import type { DecisionTrace } from "@/components/agent/agent-decision-trace";
import { ContractRejected, OutOfGas, type AgentChainIO, type AgentRound, type AgentRoundBet, type AgentSnapshot } from "./chain-io";
import { canAffordAnotherBet } from "./gas";
import type { ChainRunnerPhase } from "@/lib/agent/states";

/**
 * The on-chain agent loop as a small state machine. One `tick()` reads the chain,
 * takes AT MOST one action and returns; the caller ticks again on the page's polling
 * cadence (or immediately when `again` is true). Nothing is remembered between ticks
 * that the chain or the persisted seat record cannot give back, so a reload resumes
 * from wherever the chain is.
 *
 * Safety properties this file is responsible for:
 *   - one bet transaction per round at most. The intent is persisted (`beginBet`)
 *     BEFORE the transaction is broadcast and the round's bets are read from chain
 *     first; a round already attempted is never attempted again, whatever happened
 *     to the transaction;
 *   - a bet is never retried into a different round;
 *   - what happened in a round is always read back from chain (`getBets` + `getRound`),
 *     never assumed from a transaction hash;
 *   - every decision uses the same `decide` / `evaluateCondition` / `leashCheck` as the
 *     simulated driver (src/store/agent-seat.ts);
 *   - the exit sequence derives everything from the agent address's chain balances and
 *     is safe to run any number of times.
 */

/** Where the seat record lives. The browser passes the zustand store; tests may pass anything. */
export interface SeatPort {
  get(): AgentSeat | undefined;
  stop(reason: string): void;
  note(text: string): void;
  recordSkip(roundId: number, why: string, trace: DecisionTrace): void;
  beginBet(roundId: number, bets: AgentBet[], trace: DecisionTrace): void;
  adoptBet(roundId: number, wager: number, trace: DecisionTrace): void;
  setBetTx(roundId: number, tx: Hex): void;
  resolveBet(roundId: number, outcome: ChainBetOutcome): void;
  markSwept(at: number | null): void;
}

export type RunnerPhase = ChainRunnerPhase;

export interface RunnerStatus {
  phase: RunnerPhase;
  /** One plain sentence for the UI. */
  note: string;
  snapshot: AgentSnapshot | null;
  /** Last error, kept until a tick completes cleanly. */
  error: string | null;
  roundId: number | null;
  updatedAt: number;
}

export interface RunnerOptions {
  io: AgentChainIO;
  seat: SeatPort;
  /** Where funds go back to. Fixed when the key was created. */
  owner: Address;
  tableId: number;
  now?: () => number;
  /** Approximate betting window in seconds (not on chain). */
  bettingWindowSeconds: number;
  /** Do not send a bet with less than this many seconds of the window left. */
  lateGuardSeconds?: number;
  /** How long a broadcast transaction may stay unseen before it is treated as dropped. */
  txTimeoutMs?: number;
  /** How long the exit waits for a round the agent has a bet in before leaving anyway. */
  exitWaitSeconds?: number;
  onStatus?: (s: RunnerStatus) => void;
  /** A round settled with a positive return (for the owner's collection log). */
  onSettled?: (e: { roundId: number; result: number; delta: number }) => void;
}

type TxKind = "approve" | "enter" | "bet" | "leave" | "chips" | "eth";
const NO_ROUND = -1;
const RECENT_WINDOW = 12;

const isFinal = (r: AgentRound) => r.status === ROUND_STATUS.Settled || r.status === ROUND_STATUS.Voided;
const message = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e));

export class AgentRunner {
  private readonly io: AgentChainIO;
  private readonly seat: SeatPort;
  private readonly o: Required<Pick<RunnerOptions, "bettingWindowSeconds" | "lateGuardSeconds" | "txTimeoutMs" | "exitWaitSeconds">> & RunnerOptions;
  private busy = false;
  /** A broadcast transaction whose receipt has not been seen yet. */
  private tx: { kind: TxKind; hash: Hex; sentAt: number } | null = null;
  private sweepRequested = false;
  private exitWaitFrom: number | null = null;
  private status: RunnerStatus = { phase: "idle", note: "", snapshot: null, error: null, roundId: null, updatedAt: 0 };

  constructor(options: RunnerOptions) {
    this.io = options.io;
    this.seat = options.seat;
    this.o = { lateGuardSeconds: 10, txTimeoutMs: 120_000, exitWaitSeconds: 300, ...options };
  }

  private now() {
    return this.o.now ? this.o.now() : Date.now();
  }

  getStatus(): RunnerStatus {
    return this.status;
  }

  /** Owner asked for everything back. Works whatever state the seat record is in. */
  requestSweep() {
    const seat = this.seat.get();
    if (seat && seat.status !== "stopped") this.seat.stop("Swept back by owner.");
    this.sweepRequested = true;
    this.seat.markSwept(null);
  }

  get sweeping() {
    return this.sweepRequested;
  }

  private publish(phase: RunnerPhase, note: string, extra: Partial<RunnerStatus> = {}) {
    this.status = { ...this.status, phase, note, error: null, ...extra, updatedAt: this.now() };
    this.o.onStatus?.(this.status);
  }

  /** Read balances for display only. Sends nothing. */
  async peek(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const snapshot = await this.io.snapshot();
      this.publish(this.status.phase, this.status.note, { snapshot });
    } catch (e) {
      this.status = { ...this.status, error: message(e), updatedAt: this.now() };
      this.o.onStatus?.(this.status);
    } finally {
      this.busy = false;
    }
  }

  /** Runs one step. Resolves with `again: true` when the caller should tick again right away. */
  async tick(): Promise<{ again: boolean }> {
    if (this.busy) return { again: false };
    this.busy = true;
    try {
      return { again: await this.step() };
    } catch (e) {
      if (e instanceof OutOfGas) {
        this.status = { ...this.status, phase: "out-of-gas", note: "The agent wallet is out of gas. Send it a little ETH, then sweep.", error: e.message, updatedAt: this.now() };
      } else {
        // Chain unreadable or a transaction could not be sent. Nothing is assumed; the next tick re-reads everything.
        this.status = { ...this.status, phase: "rpc-error", note: "Robinhood Chain could not be reached. Retrying.", error: message(e), updatedAt: this.now() };
      }
      this.o.onStatus?.(this.status);
      return { again: false };
    } finally {
      this.busy = false;
    }
  }

  /* ------------------------------------------------------------------ step */

  private async step(): Promise<boolean> {
    // A. A transaction is in flight: learn its fate before deciding anything else.
    if (this.tx) {
      const state = await this.io.receipt(this.tx.hash);
      if (state === "pending") {
        if (this.now() - this.tx.sentAt < this.o.txTimeoutMs) {
          this.publish("confirming", "Waiting for the network to include a transaction.");
          return false;
        }
        this.seat.note(`A ${this.tx.kind} transaction was not included after ${Math.round(this.o.txTimeoutMs / 1000)} s and is treated as dropped.`);
      } else if (state === "reverted") {
        this.seat.note(`A ${this.tx.kind} transaction reverted on chain.`);
      }
      this.tx = null;
    }

    const snap = await this.io.snapshot();
    this.status = { ...this.status, snapshot: snap };
    let seat = this.seat.get();

    // B. Book a bet whose round has ended (also for stopped seats: the result is still owed to the log).
    if (seat?.chain?.pending) {
      await this.reconcile(seat.chain.pending.roundId);
      seat = this.seat.get();
    }

    if (!seat || seat.status === "stopped" || this.sweepRequested) return this.exit(seat, snap);
    if (seat.status === "pending-approval") {
      this.publish("awaiting-funds", "Waiting for the owner's approval and funding.", { snapshot: snap });
      return false;
    }
    if (seat.status === "paused") {
      this.publish("paused", "Paused by owner. Chips stay in the agent's escrow.", { snapshot: snap });
      return false;
    }

    // C. Leash limits that do not depend on a round (rounds, stop-loss, stop-win, time, allowance).
    const standing = decide(seat, NO_ROUND, this.now());
    if (!standing.act && standing.stop) return this.stop(standing.stop);

    // D. Keep enough gas to leave and send everything back.
    // (An address that holds nothing and has never bet is still waiting for its funding to show up.)
    const unfunded = snap.chipUnits === 0 && snap.escrow === 0n && seat.decisions === 0 && !seat.chain?.pending;
    if (!unfunded && !canAffordAnotherBet(snap.eth, snap.gasPrice)) {
      return this.stop("Gas float too low for more transactions.");
    }

    // E. Chips in the wallet go to escrow (approving the treasury once).
    if (snap.chipUnits > 0) {
      if (!snap.approved) {
        this.publish("approving", "Approving the treasury to escrow the agent's chips.", { snapshot: snap });
        await this.send("approve", () => this.io.approveTreasury());
        this.seat.note("Agent approved the treasury for its chips.");
        return true;
      }
      const sel = selectAllChips(snap.chips);
      this.publish("entering", `Moving ${sel.units} chips into the agent's escrow.`, { snapshot: snap });
      await this.send("enter", () => this.io.enterTable(sel.ids, sel.amounts));
      this.seat.note(`Agent entered the table with ${sel.units} chips.`);
      return true;
    }
    if (snap.escrow === 0n && !seat.chain?.pending) {
      if (unfunded) {
        this.publish("awaiting-funds", "Waiting for chips to arrive at the agent wallet.", { snapshot: snap });
        return false;
      }
      return this.stop("Allowance exhausted.");
    }

    // F. The round.
    const round = await this.io.currentRound(this.o.tableId);
    if (!round || round.status !== ROUND_STATUS.Open) {
      const waiting = seat.chain?.pending ? "locked" : "observing";
      this.publish(waiting, seat.chain?.pending ? `Round #${seat.chain.pending.roundId} is locked. Waiting for the result.` : "Seated. Waiting for the operator to open a round.", { snapshot: snap, roundId: round ? Number(round.roundId) : null });
      return false;
    }
    const roundId = Number(round.roundId);
    if (seat.lastRoundId === roundId) {
      this.publish(seat.chain?.pending?.roundId === roundId ? "locked" : "observing", seat.chain?.pending?.roundId === roundId ? `Bet placed in round #${roundId}. Waiting for the result.` : `Sitting out round #${roundId}.`, { snapshot: snap, roundId });
      return false;
    }
    const d = decide(seat, roundId, this.now());
    if (!d.act) {
      if (d.stop) return this.stop(d.stop);
      if (d.skip && d.skip !== "already acted" && d.skip !== "not active") {
        this.seat.recordSkip(roundId, d.skip, { roundId, at: this.now(), decision: "SKIP", rule: d.skip, input: "—", condition: null, leash: "n/a" });
      }
      this.publish("observing", `Sitting out round #${roundId}.`, { snapshot: snap, roundId });
      return false;
    }

    // Everything the decision needs, read together. A failed read throws: the round is not marked and nothing is sent.
    const [roundBets, limits, recent, commitment] = await Promise.all([this.io.bets(round.roundId), this.io.limits(this.o.tableId), this.io.recentResults(this.o.tableId, RECENT_WINDOW), this.io.commitment(round.roundId)]);
    const cond = evaluateCondition(seat.rules.condition, recent);
    const base = { roundId, at: this.now(), rule: cond.rule, input: cond.input, commitment: commitment ?? undefined } as const;

    // Resume: a bet from this address is already in the round (the tab closed after broadcasting).
    const mine = roundBets.filter((b) => b.player.toLowerCase() === this.io.agent.toLowerCase());
    if (mine.length > 0) {
      const wager = Number(mine.reduce((a, b) => a + b.stake, 0n));
      this.seat.adoptBet(roundId, wager, { ...base, decision: "BET (found on chain)", condition: null, leash: "n/a", wager, tx: null });
      this.publish("locked", `Bet already placed in round #${roundId}. Waiting for the result.`, { snapshot: snap, roundId });
      return false;
    }

    const skip = (why: string, trace: Partial<DecisionTrace>) => {
      this.seat.recordSkip(roundId, why, { ...base, decision: "SKIP", condition: true, leash: "fail", ...trace });
      this.publish("observing", `Sitting out round #${roundId}: ${why}.`, { snapshot: snap, roundId });
      return false;
    };

    // The late-bet rule: a transaction needs a block; in the last seconds it only burns gas on a revert.
    const secondsLeft = round.openedAt ? round.openedAt + this.o.bettingWindowSeconds - this.now() / 1000 : Infinity;
    if (secondsLeft < this.o.lateGuardSeconds) return skip("too late", { condition: null, leash: "n/a", leashNote: "bets were about to close" });

    if (!cond.matched) return skip("condition not met", { condition: false, leash: "n/a" });

    const slip = Object.fromEntries(seat.rules.bets.map((b) => [b.betId, 0])) as Record<string, number>;
    for (const b of seat.rules.bets) slip[b.betId] += b.stake;
    const contractBets = slipToContractBets(slip);
    // Mirror of RouletteGame.placeBets → RiskEngine.checkWager over the WHOLE round.
    const risk = checkWagerUnits(limits.availableUnits + round.reservedUnits, limits.exposureBps, [...roundBets, ...contractBets]);
    const leash = leashCheck(seat, Number(risk.maxRoundExposure));
    const sized = { maxAllowed: leash.maxAllowed, wager: leash.wager };

    if (!leash.ok) return skip("leash: wager above maximum allowed", { leashNote: `wager ${leash.wager} > max ${leash.maxAllowed}`, ...sized });
    if (limits.gameplayPaused) return skip("gameplay is paused on chain", { leashNote: "gameplay paused", ...sized });
    if (!limits.active) return skip("table is not active", { leashNote: "table not active", ...sized });
    const outOfRange = contractBets.find((b) => b.stake < limits.minStake || b.stake > limits.maxStake);
    if (outOfRange) return skip("stake outside the table limits", { leashNote: `stake ${outOfRange.stake} outside ${limits.minStake}–${limits.maxStake}`, ...sized });
    if (roundBets.length + contractBets.length > limits.maxBetsPerRound) return skip("round is full", { leashNote: `round holds ${roundBets.length} of ${limits.maxBetsPerRound} bets`, ...sized });
    if (!risk.ok) return skip("treasury limit reached", { leashNote: `round would owe ${risk.maxNetPayout} against a cap of ${risk.maxRoundExposure}`, ...sized });
    if (BigInt(leash.wager) > snap.escrow) return this.stop("Not enough chips left in escrow for the next bet.");

    // Simulate against the node. A revert is a decision (skip); a read failure is not (retry next tick).
    try {
      await this.io.simulateBets(round.roundId, contractBets);
    } catch (e) {
      if (e instanceof ContractRejected) return skip(`rejected by the contract: ${e.message}`, { leashNote: e.message, ...sized });
      throw e;
    }

    // Persist the intent, then broadcast. From here this round is never attempted again.
    const trace: DecisionTrace = { ...base, decision: betDecisionLabel(seat.rules.bets), condition: true, leash: "pass", leashNote: `${Math.max(0, seat.rules.stopLoss + seat.net)} to stop loss`, ...sized, tx: null };
    this.seat.beginBet(roundId, seat.rules.bets, trace);
    this.publish("executing", `Placing ${leash.wager} chips in round #${roundId}.`, { snapshot: snap, roundId });
    let hash: Hex;
    try {
      hash = await this.io.placeBets(round.roundId, contractBets);
    } catch (e) {
      if (e instanceof OutOfGas) throw e;
      // Unknown whether it reached the network. The chain decides at settlement; no second attempt.
      this.seat.note(`Round #${roundId}: the bet could not be confirmed as sent (${message(e)}). It will be checked against the chain.`);
      this.publish("locked", `Round #${roundId}: checking whether the bet was included.`, { snapshot: snap, roundId });
      return false;
    }
    this.seat.setBetTx(roundId, hash);
    this.tx = { kind: "bet", hash, sentAt: this.now() };
    const state = await this.io.wait(hash);
    this.tx = null;
    if (state === "reverted") this.seat.note(`Round #${roundId}: the bet transaction reverted on chain.`);
    this.publish("locked", `Bet placed in round #${roundId}. Waiting for the result.`, { roundId });
    return false;
  }

  /* --------------------------------------------------------------- helpers */

  private stop(reason: string): boolean {
    this.seat.stop(reason);
    this.publish("leaving", `${reason} Returning funds to the owner.`);
    return true;
  }

  /** Broadcast, remember the hash, wait for the receipt. A revert is reported, never assumed away. */
  private async send(kind: TxKind, fn: () => Promise<Hex>): Promise<void> {
    const hash = await fn();
    this.tx = { kind, hash, sentAt: this.now() };
    const state = await this.io.wait(hash);
    this.tx = null;
    if (state === "reverted") throw new Error(`The ${kind} transaction reverted on chain.`);
  }

  /** Read the round the agent bet on and, once it is final, book what actually happened. */
  private async reconcile(roundId: number): Promise<void> {
    const round = await this.io.round(BigInt(roundId));
    if (!isFinal(round)) return;
    const bets = await this.io.bets(BigInt(roundId));
    const mine = bets.filter((b) => b.player.toLowerCase() === this.io.agent.toLowerCase());
    if (mine.length === 0) {
      this.seat.resolveBet(roundId, { kind: "missed", why: "the bet was not included before the round closed" });
      return;
    }
    const staked = Number(mine.reduce((a, b) => a + b.stake, 0n));
    if (round.status === ROUND_STATUS.Voided) {
      this.seat.resolveBet(roundId, { kind: "voided", staked });
      return;
    }
    const returned = Number(mine.reduce((a, b) => a + (wins(b, round.result) ? b.stake * (BigInt(b.multiplier) + 1n) : 0n), 0n));
    this.seat.resolveBet(roundId, { kind: "settled", result: round.result, staked, returned });
    if (returned > staked) this.o.onSettled?.({ roundId, result: round.result, delta: returned - staked });
  }

  /**
   * Leave the table and send everything back to the owner. Each call does one thing,
   * chosen only from what the agent address holds on chain right now.
   */
  private async exit(seat: AgentSeat | undefined, snap: AgentSnapshot): Promise<boolean> {
    const pending = seat?.chain?.pending;
    if (pending) {
      // Winnings of a live round return to escrow at settlement: leaving first would strand them.
      this.exitWaitFrom ??= this.now();
      if (this.now() - this.exitWaitFrom < this.o.exitWaitSeconds * 1000) {
        this.publish("waiting-settlement", `Waiting for round #${pending.roundId} to settle before leaving the table.`, { snapshot: snap, roundId: pending.roundId });
        return false;
      }
    } else {
      this.exitWaitFrom = null;
    }
    if (snap.escrow > 0n) {
      this.publish("leaving", `Leaving the table with ${snap.escrow} chips.`, { snapshot: snap });
      await this.send("leave", () => this.io.leaveTable(snap.escrow));
      this.seat.note(`Agent left the table: ${snap.escrow} chips back in its wallet.`);
      return true;
    }
    if (snap.chipUnits > 0) {
      const sel = selectAllChips(snap.chips);
      this.publish("returning-chips", `Returning ${sel.units} chips to the owner.`, { snapshot: snap });
      await this.send("chips", () => this.io.transferChips(this.o.owner, sel.ids, sel.amounts));
      this.seat.note(`${sel.units} chips returned to the owner's wallet.`);
      return true;
    }
    if (snap.eth > 0n) {
      const sent = await this.io.sweepEth(this.o.owner);
      if (sent) {
        this.publish("returning-gas", "Returning the unused gas float to the owner.", { snapshot: snap });
        this.tx = { kind: "eth", hash: sent.hash, sentAt: this.now() };
        const state = await this.io.wait(sent.hash);
        this.tx = null;
        if (state === "reverted") throw new Error("The ETH transfer reverted on chain.");
        this.seat.note("Unused gas returned to the owner's wallet.");
        return true;
      }
    }
    if (pending) {
      this.publish("waiting-settlement", `Funds returned. Round #${pending.roundId} has not settled; anything it pays lands in the agent's escrow and can be swept later.`, { snapshot: snap });
      return false;
    }
    this.sweepRequested = false;
    this.seat.markSwept(this.now());
    this.publish("swept", "Nothing left at the agent wallet.", { snapshot: snap });
    return false;
  }
}

function wins(b: AgentRoundBet, result: number): boolean {
  return ((b.numbersMask >> BigInt(result)) & 1n) === 1n;
}

/** Human label for a rule's bets, used by funding and review screens. */
export function describeBets(bets: AgentBet[]): string {
  return bets.map((b) => `${b.stake} on ${betFromId(b.betId)?.label ?? b.betId}`).join(", ");
}
