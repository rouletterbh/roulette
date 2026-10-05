import { beforeEach, describe, expect, it } from "vitest";
import { useAgentSeats, type AgentRules, type AgentSeat } from "@/store/agent-seat";
import { encodeBetById } from "@/lib/agent/encode-bets";
import { AgentRunner, type RunnerStatus } from "./runner";
import { orphanSeatPort, storeSeatPort } from "./seat-port";
import { FakeChain, FAKE_AGENT, FAKE_OWNER } from "./__fixtures__/fake-chain";
import { exitReserveWei, betCostWei } from "./gas";

const RED = 1; // red pocket
const BLACK = 2; // black pocket
const FLOAT = 300_000_000_000_000n; // 0.0003 ETH
const WINDOW = 45;

const baseRules: AgentRules = { bets: [{ betId: "red", stake: 2 }], cadence: "every", maxRounds: 50, stopLoss: 6, stopWin: null, timeLimitMinutes: 60 };

let clock = 0;
const now = () => clock;

function setup(opts: { rules?: Partial<AgentRules>; allowance?: number; eth?: bigint; chain?: ConstructorParameters<typeof FakeChain>[0]; fund?: boolean } = {}) {
  const chain = new FakeChain({ now, ...opts.chain });
  const allowance = opts.allowance ?? 20;
  const store = useAgentSeats.getState();
  const made = store.create({ name: "Steady red", owner: FAKE_OWNER, tableId: "1", rules: { ...baseRules, ...opts.rules }, allowance, isPublic: false });
  if (!made.ok) throw new Error(made.error);
  const id = made.id;
  store.attachWallet(id, FAKE_AGENT);
  if (opts.fund !== false) {
    chain.fund(allowance, opts.eth ?? FLOAT);
    store.markFunded(id);
  }
  store.approve(id);
  const statuses: RunnerStatus[] = [];
  const make = () => new AgentRunner({ io: chain, seat: storeSeatPort(id), owner: FAKE_OWNER, tableId: 1, now, bettingWindowSeconds: WINDOW, onStatus: (s) => statuses.push(s) });
  const seat = () => useAgentSeats.getState().seats[id] as AgentSeat;
  return { chain, id, runner: make(), make, seat, statuses, allowance };
}

/** Tick until the runner has nothing more to do right now. */
async function settle(runner: AgentRunner, max = 12) {
  for (let i = 0; i < max; i++) {
    const { again } = await runner.tick();
    if (!again) return;
  }
  throw new Error("runner never came to rest");
}

/** Open a round, let the agent act, close and settle it, let the agent book it. */
async function playRound(t: ReturnType<typeof setup>, id: bigint, result: number, runner = t.runner) {
  t.chain.openRound(id);
  await settle(runner);
  t.chain.closeRound(id);
  await settle(runner);
  t.chain.settleRound(id, result);
  await settle(runner);
}

beforeEach(() => {
  clock = Date.now();
  localStorage.clear();
  useAgentSeats.setState({ seats: {} });
});

describe("agent runner: full lifecycle on a fake chain", () => {
  it("funds → approves → enters → bets → settles (win and loss) → stop-loss → leaves → sweeps, and the balances reconcile", async () => {
    const t = setup();
    const { chain, runner, seat } = t;

    // set-up: approve the treasury, then escrow every chip
    await settle(runner);
    expect(chain.sent.map((s) => s.kind)).toEqual(["approve", "enter"]);
    expect(chain.approved).toBe(true);
    expect(chain.escrow).toBe(20n);
    expect(runner.getStatus().phase).toBe("observing");

    // round 1: red wins (+2)
    chain.openRound(1n);
    await settle(runner);
    expect(chain.betsSentFor(1n)).toBe(1);
    expect(chain.escrow).toBe(18n);
    expect(seat().chain?.pending).toMatchObject({ roundId: 1, wager: 2 });
    expect(seat().chain?.pending?.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(runner.getStatus().phase).toBe("locked");
    // more ticks during the same open round never send a second bet
    await settle(runner);
    await settle(runner);
    expect(chain.betsSentFor(1n)).toBe(1);
    chain.closeRound(1n);
    await settle(runner);
    chain.settleRound(1n, RED);
    await settle(runner);
    expect(seat().net).toBe(2);
    expect(seat().roundsPlayed).toBe(1);
    expect(seat().chain?.pending).toBeNull();
    const trace = seat().traces.at(-1)!;
    expect(trace).toMatchObject({ roundId: 1, decision: "BET RED", leash: "pass", wager: 2, result: "RED 1", outcome: 2 });
    expect(trace.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(trace.commitment).toMatch(/^0x/);

    // rounds 2..5: black, four losses → net 2 − 8 = −6 = stop-loss
    for (const id of [2n, 3n, 4n, 5n]) await playRound(t, id, BLACK);
    expect(seat().net).toBe(-6);
    expect(seat().status).toBe("stopped");
    expect(seat().stoppedReason).toBe("Stop-loss reached.");

    // exit ran by itself: leave → chips → ETH
    expect(chain.sent.slice(-3).map((s) => s.kind)).toEqual(["leave", "chips", "eth"]);
    expect(chain.agentUnits).toBe(0);
    expect(chain.eth).toBe(0n);
    expect(chain.ownerChips).toBe(20 - 6);
    const fees = BigInt(chain.sent.length) * chain.gasPerTx * chain.gasPrice;
    expect(chain.ownerEth).toBe(FLOAT - fees);
    expect(seat().chain?.sweptAt).not.toBeNull();
    expect(runner.getStatus().phase).toBe("swept");

    // five bets, one per round, never more
    for (const id of [1n, 2n, 3n, 4n, 5n]) expect(chain.betsSentFor(id)).toBe(1);
    // a round opened after the stop is ignored
    chain.openRound(6n);
    await settle(runner);
    expect(chain.betsSentFor(6n)).toBe(0);
  });

  it("stops at the round cap and at the time limit", async () => {
    const a = setup({ rules: { maxRounds: 2, stopLoss: 20 } });
    await settle(a.runner);
    await playRound(a, 1n, RED);
    await playRound(a, 2n, RED);
    expect(a.seat().stoppedReason).toBe("Reached the round limit.");
    expect(a.chain.ownerChips).toBe(24);
    expect(a.chain.agentUnits).toBe(0);

    useAgentSeats.setState({ seats: {} });
    const b = setup({ rules: { timeLimitMinutes: 5 } });
    await settle(b.runner);
    clock += 5 * 60_000 + 1_000; // approvedAt is stamped with the real clock a few ms after `clock`
    await settle(b.runner);
    expect(b.seat().stoppedReason).toBe("Time limit reached.");
    expect(b.chain.ownerChips).toBe(20);
  });

  it("waits for its own open bet to settle before leaving when the owner stops mid-round", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    await settle(t.runner);
    useAgentSeats.getState().stop(t.id, "Stopped by owner.");
    await settle(t.runner);
    expect(t.runner.getStatus().phase).toBe("waiting-settlement");
    expect(t.chain.sent.some((s) => s.kind === "leave")).toBe(false);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    await settle(t.runner);
    expect(t.seat().net).toBe(2);
    expect(t.chain.ownerChips).toBe(22);
    expect(t.chain.agentUnits).toBe(0);
  });

  it("books a voided round as a refund, not a result", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    await settle(t.runner);
    t.chain.voidRound(1n);
    await settle(t.runner);
    expect(t.seat().net).toBe(0);
    expect(t.seat().roundsPlayed).toBe(0);
    expect(t.seat().chain?.pending).toBeNull();
    expect(t.chain.escrow).toBe(20n);
    expect(t.seat().traces.at(-1)?.result).toContain("VOIDED");
  });

  it("does nothing while paused and nothing before approval", async () => {
    const t = setup();
    await settle(t.runner);
    useAgentSeats.getState().pause(t.id);
    t.chain.openRound(1n);
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.runner.getStatus().phase).toBe("paused");
    useAgentSeats.getState().resume(t.id);
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(1);
  });

  it("evaluates the thesis condition against settled chain results", async () => {
    const t = setup({ rules: { cadence: "after-condition", condition: { type: "color-count", side: "black", window: 3, min: 2 }, stopLoss: 20 } });
    await settle(t.runner);
    t.chain.history = [RED, RED, BLACK];
    t.chain.openRound(1n);
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.seat().traces.at(-1)).toMatchObject({ decision: "SKIP", condition: false, input: "R R B" });
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, BLACK); // history is now B R R → black count 1… then one more black
    t.chain.history = [BLACK, BLACK, RED];
    t.chain.openRound(2n);
    await settle(t.runner);
    expect(t.chain.betsSentFor(2n)).toBe(1);
  });
});

describe("agent runner: resume after a reload", () => {
  it("finds a bet already on chain for the open round and never bets it again", async () => {
    const t = setup();
    await settle(t.runner);
    // The tab died right after broadcasting: the bet is on chain, the seat record knows nothing.
    t.chain.openRound(1n);
    t.chain.escrow -= 2n;
    t.chain.rounds.get(1n)!.bets.push({ player: FAKE_AGENT, ...encodeBetById("red", 2) });
    const fresh = t.make();
    await settle(fresh);
    await settle(fresh);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.seat().chain?.pending).toMatchObject({ roundId: 1, wager: 2, tx: null });
    expect(t.seat().lastRoundId).toBe(1);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    await settle(fresh);
    expect(t.seat().net).toBe(2);
    expect(t.seat().roundsPlayed).toBe(1);
  });

  it("a new runner picks up a persisted pending bet, books it, and keeps playing", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(1);
    // reload: the seat record survives (persisted), the runner's memory does not
    const persisted = JSON.parse(localStorage.getItem("agent-seats")!).state.seats[t.id];
    expect(persisted.chain.pending.roundId).toBe(1);
    const fresh = t.make();
    await settle(fresh);
    expect(t.chain.betsSentFor(1n)).toBe(1);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, BLACK);
    await settle(fresh);
    expect(t.seat().net).toBe(-2);
    await playRound(t, 2n, RED, fresh);
    expect(t.chain.betsSentFor(2n)).toBe(1);
    expect(t.seat().net).toBe(0);
  });

  it("books a round that settled while the tab was closed", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    await settle(t.runner);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    t.chain.openRound(2n); // the table moved on
    const fresh = t.make();
    await settle(fresh);
    expect(t.seat().net).toBe(2);
    expect(t.chain.betsSentFor(2n)).toBe(1);
  });
});

describe("agent runner: skips", () => {
  it("skips a round with less than 10 s of the betting window left, with reason 'too late'", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n, Math.floor(clock / 1000) - (WINDOW - 9));
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.chain.calls.simulateBets ?? 0).toBe(0);
    expect(t.seat().log.at(-1)?.text).toBe("Round #1: skipped (too late)");
    expect(t.seat().traces.at(-1)).toMatchObject({ roundId: 1, decision: "SKIP" });
    // never retried into the same round, and the next round is played normally
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    t.chain.openRound(2n, Math.floor(clock / 1000) - (WINDOW - 11));
    await settle(t.runner);
    expect(t.chain.betsSentFor(2n)).toBe(1);
    expect(t.seat().net).toBe(0); // round 1 was not ours
  });

  it("skips when the treasury exposure check would reject the bet, without sending anything", async () => {
    // available 100 units at 25% → cap 25. A 1-chip straight owes 35.
    const t = setup({ rules: { bets: [{ betId: "straight:17", stake: 1 }] }, chain: { availableUnits: 100n } });
    await settle(t.runner);
    t.chain.openRound(1n);
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.chain.calls.simulateBets ?? 0).toBe(0);
    expect(t.seat().skips).toBe(1);
    expect(t.seat().traces.at(-1)).toMatchObject({ decision: "SKIP", leash: "fail" });
    expect(t.seat().log.at(-1)?.text).toMatch(/skipped \((treasury limit reached|leash: wager above maximum allowed)\)/);
  });

  it("counts other players' bets in the round-wide exposure check", async () => {
    // cap = 40 × 25% = 10. Another player's 8 on red already owes 8; our 4 on red would make 12.
    const t = setup({ rules: { bets: [{ betId: "red", stake: 4 }], maxBet: 10 }, chain: { availableUnits: 40n } });
    await settle(t.runner);
    t.chain.openRound(1n);
    t.chain.otherBet(1n, encodeBetById("red", 8));
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.seat().log.at(-1)?.text).toBe("Round #1: skipped (treasury limit reached)");
  });

  it("skips when the node's simulation reverts, and records why", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    t.chain.limitsState.maxStake = 500n;
    const { ContractRejected } = await import("./chain-io");
    t.chain.fail("simulateBets", "before", new ContractRejected("Round 1 is closed. Wait for the next round."));
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    expect(t.seat().traces.at(-1)?.leashNote).toBe("Round 1 is closed. Wait for the next round.");
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
  });
});

describe("agent runner: gas", () => {
  it("stops when the float no longer covers another bet plus the exit, then leaves and returns everything", async () => {
    const gasPrice = 20_000_000n;
    // enough for approve + enter + one bet, then below the reserve
    const eth = exitReserveWei(gasPrice) + betCostWei(gasPrice) + 3n * 150_000n * gasPrice - 1n;
    const t = setup({ eth, rules: { stopLoss: 20 } });
    await settle(t.runner);
    await playRound(t, 1n, RED);
    expect(t.chain.betsSentFor(1n)).toBe(1);
    expect(t.seat().status).toBe("stopped");
    expect(t.seat().stoppedReason).toBe("Gas float too low for more transactions.");
    expect(t.chain.agentUnits).toBe(0);
    expect(t.chain.ownerChips).toBe(22);
    expect(t.chain.eth).toBe(0n);
    expect(t.chain.ownerEth).toBeGreaterThan(0n);
    t.chain.openRound(2n);
    await settle(t.runner);
    expect(t.chain.betsSentFor(2n)).toBe(0);
  });

  it("reports out-of-gas honestly when it cannot even leave, and finishes after a top-up", async () => {
    const t = setup({ rules: { stopLoss: 20 } });
    await settle(t.runner);
    t.chain.eth = 1n; // drained
    await settle(t.runner);
    expect(t.seat().status).toBe("stopped");
    expect(t.runner.getStatus().phase).toBe("out-of-gas");
    expect(t.chain.escrow).toBe(20n); // nothing lost, nothing moved
    expect(t.seat().chain?.sweptAt).toBeNull();
    t.chain.eth = FLOAT; // owner sends gas
    await settle(t.runner);
    expect(t.chain.ownerChips).toBe(20);
    expect(t.chain.agentUnits).toBe(0);
    expect(t.runner.getStatus().phase).toBe("swept");
  });
});

describe("agent runner: RPC failures", () => {
  it("a failed read changes nothing and the next tick carries on", async () => {
    const t = setup();
    t.chain.fail("snapshot");
    await t.runner.tick();
    expect(t.runner.getStatus().phase).toBe("rpc-error");
    expect(t.runner.getStatus().error).toMatch(/fetch failed/);
    expect(t.chain.sent).toHaveLength(0);
    await settle(t.runner);
    expect(t.chain.escrow).toBe(20n);
    expect(t.runner.getStatus().error).toBeNull();
  });

  it("a read failure while deciding does not mark the round: it is retried and bet exactly once", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    t.chain.fail("limits");
    await settle(t.runner);
    expect(t.runner.getStatus().phase).toBe("rpc-error");
    expect(t.seat().lastRoundId).toBeNull();
    t.chain.fail("simulateBets"); // plain network error, not a revert
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    await settle(t.runner);
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(1);
  });

  it("when the bet reached the network but the response was lost, it is not sent again and the result is still booked", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    t.chain.fail("placeBets", "after");
    await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(1);
    expect(t.seat().chain?.pending).toMatchObject({ roundId: 1, tx: null });
    for (let i = 0; i < 4; i++) await settle(t.runner);
    expect(t.chain.betsSentFor(1n)).toBe(1);
    expect(t.chain.calls.placeBets).toBe(1);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    await settle(t.runner);
    expect(t.seat().net).toBe(2);
    expect(t.seat().chain?.pending).toBeNull();
  });

  it("when the bet never reached the network, the round is booked as missed and never retried, and the next round is played", async () => {
    const t = setup();
    await settle(t.runner);
    t.chain.openRound(1n);
    t.chain.fail("placeBets", "before");
    await settle(t.runner);
    for (let i = 0; i < 3; i++) await settle(t.runner);
    expect(t.chain.calls.placeBets).toBe(1);
    expect(t.chain.betsSentFor(1n)).toBe(0);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    await settle(t.runner);
    expect(t.seat().chain?.pending).toBeNull();
    expect(t.seat().net).toBe(0);
    expect(t.seat().roundsPlayed).toBe(0);
    expect(t.seat().traces.at(-1)?.result).toBe("NOT INCLUDED");
    await playRound(t, 2n, RED);
    expect(t.chain.betsSentFor(2n)).toBe(1);
    expect(t.seat().net).toBe(2);
  });

  it("a lost receipt does not cause a second enterTable; the runner waits, then proceeds", async () => {
    const t = setup();
    t.chain.holdReceipts = true;
    await t.runner.tick(); // approve broadcast, wait() fails
    expect(t.runner.getStatus().phase).toBe("rpc-error");
    await t.runner.tick();
    await t.runner.tick();
    expect(t.runner.getStatus().phase).toBe("confirming");
    expect(t.chain.sent.map((s) => s.kind)).toEqual(["approve"]);
    t.chain.mine();
    await t.runner.tick(); // sees the receipt, sends enter, wait() fails again
    await t.runner.tick();
    expect(t.chain.sent.map((s) => s.kind)).toEqual(["approve", "enter"]);
    t.chain.mine();
    t.chain.holdReceipts = false;
    await settle(t.runner);
    expect(t.chain.sent.map((s) => s.kind)).toEqual(["approve", "enter"]);
    expect(t.chain.escrow).toBe(20n);
    expect(t.runner.getStatus().phase).toBe("observing");
  });

  it("a transaction that never appears is dropped after the timeout instead of blocking forever", async () => {
    const t = setup();
    t.chain.holdReceipts = true;
    await t.runner.tick();
    clock += 121_000;
    t.chain.holdReceipts = false;
    t.chain.approved = false; // it really was dropped
    await settle(t.runner);
    expect(t.chain.escrow).toBe(20n);
    expect(t.seat().log.some((l) => /treated as dropped/.test(l.text))).toBe(true);
  });

  it("a failure in the middle of the exit resumes where the chain is, without repeating a step", async () => {
    const t = setup({ rules: { maxRounds: 1, stopLoss: 20 } });
    await settle(t.runner);
    t.chain.openRound(1n);
    await settle(t.runner);
    t.chain.closeRound(1n);
    t.chain.settleRound(1n, RED);
    t.chain.fail("transferChips", "after"); // chips moved, response lost
    await settle(t.runner);
    expect(t.runner.getStatus().phase).toBe("rpc-error");
    await settle(t.runner);
    expect(t.chain.sent.filter((s) => s.kind === "leave")).toHaveLength(1);
    expect(t.chain.sent.filter((s) => s.kind === "chips")).toHaveLength(1);
    expect(t.chain.ownerChips).toBe(22);
    expect(t.chain.eth).toBe(0n);
    expect(t.runner.getStatus().phase).toBe("swept");
  });
});

describe("agent runner: sweep", () => {
  it("returns everything at any time, is idempotent, and only ever pays the owner", async () => {
    const t = setup();
    await settle(t.runner);
    expect(t.chain.escrow).toBe(20n);
    t.runner.requestSweep();
    await settle(t.runner);
    expect(t.seat().status).toBe("stopped");
    expect(t.seat().stoppedReason).toBe("Swept back by owner.");
    expect(t.chain.ownerChips).toBe(20);
    expect(t.chain.agentUnits).toBe(0);
    expect(t.chain.eth).toBe(0n);
    const sentBefore = t.chain.sent.length;
    t.runner.requestSweep();
    await settle(t.runner);
    t.runner.requestSweep();
    await settle(t.runner);
    expect(t.chain.sent.length).toBe(sentBefore);
    expect(t.runner.getStatus().phase).toBe("swept");
  });

  it("works without any seat record, from chain balances alone", async () => {
    const chain = new FakeChain({ now });
    chain.fund(7, FLOAT);
    chain.escrow = 30n; // some in escrow, some loose, no record of either
    const runner = new AgentRunner({ io: chain, seat: orphanSeatPort(), owner: FAKE_OWNER, tableId: 1, now, bettingWindowSeconds: WINDOW });
    runner.requestSweep();
    await settle(runner);
    expect(chain.sent.map((s) => s.kind)).toEqual(["leave", "chips", "eth"]);
    expect(chain.ownerChips).toBe(37);
    expect(chain.agentUnits).toBe(0);
    expect(chain.eth).toBe(0n);
  });

  it("sweeps chips that arrive after a first sweep (weird state)", async () => {
    const t = setup();
    await settle(t.runner);
    t.runner.requestSweep();
    await settle(t.runner);
    expect(t.seat().chain?.sweptAt).not.toBeNull();
    t.chain.fund(5, FLOAT);
    t.runner.requestSweep();
    expect(t.seat().chain?.sweptAt).toBeNull();
    await settle(t.runner);
    expect(t.chain.ownerChips).toBe(25);
    expect(t.chain.agentUnits).toBe(0);
  });

  it("a half-funded seat that was never approved can be swept", async () => {
    const t = setup({ fund: false });
    useAgentSeats.setState((s) => ({ seats: { ...s.seats, [t.id]: { ...s.seats[t.id], status: "pending-approval", approvedAt: null } } }));
    t.chain.eth = FLOAT; // the owner signed the gas transfer, then walked away
    await settle(t.runner);
    expect(t.chain.sent).toHaveLength(0);
    t.runner.requestSweep();
    await settle(t.runner);
    expect(t.chain.eth).toBe(0n);
    expect(t.chain.ownerEth).toBe(FLOAT - t.chain.gasPerTx * t.chain.gasPrice);
  });
});
