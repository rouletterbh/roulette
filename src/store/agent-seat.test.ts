import { describe, it, expect } from "vitest";
import { validateRules, decide, AGENT_CAPS, type AgentRules, type AgentSeat } from "./agent-seat";

const rules: AgentRules = { bets: [{ betId: "red", stake: 2 }], cadence: "every", maxRounds: 20, stopLoss: 20, stopWin: null, timeLimitMinutes: 30 };
const seat = (over: Partial<AgentSeat> = {}): AgentSeat => ({
  id: "a", code: "ARC-1", strategyClass: "Adaptive Low Variance", name: "t", thesis: "", collection: { primaryAssetId: null, fallbackAssetId: null }, owner: "o", tableId: "t", rules, allowance: 40, status: "active", isPublic: true, createdAt: 0, approvedAt: 1_000, stoppedReason: null,
  roundsPlayed: 0, net: 0, lastRoundId: null, lastOutcomeWasLoss: false, log: [], traces: [], decisions: 0, skips: 0, followers: 0, ...over,
});

describe("agent rules", () => {
  it("accepts a sane rule set", () => expect(validateRules(rules, 40, 100)).toBeNull());
  it("requires a stop-loss and caps it to the allowance", () => {
    expect(validateRules({ ...rules, stopLoss: 0 }, 40, 100)).toMatch(/stop-loss/i);
    expect(validateRules({ ...rules, stopLoss: 41 }, 40, 100)).toMatch(/exceed/i);
  });
  it("caps the allowance to a share of the balance", () => {
    expect(validateRules(rules, 60, 100)).toMatch(/50%/);
  });
  it("enforces round and time caps", () => {
    expect(validateRules({ ...rules, maxRounds: AGENT_CAPS.maxRounds + 1 }, 40, 100)).toMatch(/Rounds/);
    expect(validateRules({ ...rules, timeLimitMinutes: AGENT_CAPS.maxTimeMinutes + 1 }, 40, 100)).toMatch(/Time/);
  });
  it("rejects unknown bets and oversize rounds", () => {
    expect(validateRules({ ...rules, bets: [{ betId: "nope", stake: 1 }] }, 40, 100)).toMatch(/Unknown/);
    expect(validateRules({ ...rules, bets: [{ betId: "red", stake: 50 }] }, 40, 100)).toMatch(/exceeds the allowance/);
  });
});

describe("agent decisions", () => {
  it("acts when active and within limits", () => expect(decide(seat(), 1, 2_000)).toEqual({ act: true }));
  it("never acts twice in one round", () => expect(decide(seat({ lastRoundId: 3 }), 3)).toMatchObject({ act: false, skip: "already acted" }));
  it("stops at stop-loss", () => expect(decide(seat({ net: -20 }), 2, 2_000)).toMatchObject({ act: false, stop: "Stop-loss reached." }));
  it("stops at stop-win", () => expect(decide(seat({ net: 10, rules: { ...rules, stopWin: 10 } }), 2, 2_000)).toMatchObject({ act: false, stop: "Stop-win reached." }));
  it("stops at the round limit", () => expect(decide(seat({ roundsPlayed: 20 }), 2, 2_000)).toMatchObject({ act: false, stop: "Reached the round limit." }));
  it("stops when the time limit passes", () => expect(decide(seat(), 2, 1_000 + 31 * 60_000)).toMatchObject({ act: false, stop: "Time limit reached." }));
  it("stops when the allowance can't cover a round", () => expect(decide(seat({ allowance: 10, net: -9 }), 2, 2_000)).toMatchObject({ act: false, stop: "Allowance exhausted." }));
  it("after-loss cadence waits for a loss", () => {
    expect(decide(seat({ rules: { ...rules, cadence: "after-loss" }, roundsPlayed: 1, lastOutcomeWasLoss: false, lastRoundId: 1 }), 2, 2_000)).toMatchObject({ act: false });
    expect(decide(seat({ rules: { ...rules, cadence: "after-loss" }, roundsPlayed: 1, lastOutcomeWasLoss: true, lastRoundId: 1 }), 2, 2_000)).toEqual({ act: true });
  });
  it("does nothing while paused or pending", () => {
    expect(decide(seat({ status: "paused" }), 1)).toMatchObject({ act: false });
    expect(decide(seat({ status: "pending-approval" }), 1)).toMatchObject({ act: false });
  });
});

describe("thesis conditions", () => {
  it("evaluates color counts over a window", async () => {
    const { evaluateCondition } = await import("./agent-seat");
    const r = evaluateCondition({ type: "color-count", side: "red", window: 5, min: 3 }, [1, 3, 2, 5, 4, 9]); // R R B R B
    expect(r.matched).toBe(true);
    expect(r.input).toBe("R R B R B");
    expect(evaluateCondition({ type: "color-count", side: "black", window: 5, min: 3 }, [1, 3, 2, 5, 4]).matched).toBe(false);
  });
  it("treats no condition as always matched", async () => {
    const { evaluateCondition } = await import("./agent-seat");
    expect(evaluateCondition(null, []).matched).toBe(true);
  });
  it("zero-absent needs a full window without zero", async () => {
    const { evaluateCondition } = await import("./agent-seat");
    expect(evaluateCondition({ type: "zero-absent", window: 3, min: 3 }, [1, 2, 3]).matched).toBe(true);
    expect(evaluateCondition({ type: "zero-absent", window: 3, min: 3 }, [1, 0, 3]).matched).toBe(false);
  });
});

describe("leash arithmetic shared by the simulated driver and the chain runner", () => {
  it("allows the smallest of the exposure cap, the maximum bet and what is left of the allowance", async () => {
    const { leashCheck, betDecisionLabel } = await import("./agent-seat");
    expect(leashCheck(seat(), 100)).toEqual({ maxAllowed: 40, wager: 2, ok: true });
    expect(leashCheck(seat({ net: -39 }), 100)).toEqual({ maxAllowed: 1, wager: 2, ok: false });
    expect(leashCheck(seat({ net: 15 }), 100).maxAllowed).toBe(40); // winnings do not raise the allowance
    expect(leashCheck(seat({ rules: { ...rules, maxBet: 1 } }), 100).ok).toBe(false);
    expect(leashCheck(seat(), 1.9)).toEqual({ maxAllowed: 1, wager: 2, ok: false });
    expect(betDecisionLabel([{ betId: "red", stake: 1 }, { betId: "straight:17", stake: 1 }])).toBe("BET RED + 17");
  });
});

describe("chain-mode seat bookkeeping", () => {
  const trace = { roundId: 9, at: 0, decision: "BET RED", rule: "", input: "", condition: true, leash: "pass" as const, tx: null };
  const fresh = async () => {
    const { useAgentSeats } = await import("./agent-seat");
    useAgentSeats.setState({ seats: {} });
    const made = useAgentSeats.getState().create({ name: "c", owner: "0xOwner", tableId: "1", rules, allowance: 40, isPublic: false });
    if (!made.ok) throw new Error(made.error);
    useAgentSeats.getState().attachWallet(made.id, "0x00000000000000000000000000000000000000aa");
    return { store: useAgentSeats, id: made.id, get: () => useAgentSeats.getState().seats[made.id] };
  };

  it("records the intent before the transaction, then the hash, then the chain's outcome", async () => {
    const { store, id, get } = await fresh();
    store.getState().markFunded(id);
    store.getState().approve(id);
    store.getState().beginChainBet(id, 9, rules.bets, trace);
    expect(get().lastRoundId).toBe(9);
    expect(get().chain?.pending).toMatchObject({ roundId: 9, wager: 2, tx: null });
    expect(decide(get(), 9)).toEqual({ act: false, skip: "already acted" }); // the round can never be bet twice
    store.getState().setChainBetTx(id, 9, "0xabc");
    expect(get().chain?.pending?.tx).toBe("0xabc");
    expect(get().traces.at(-1)?.tx).toBe("0xabc");
    store.getState().resolveChainBet(id, 9, { kind: "settled", result: 3, staked: 2, returned: 4 });
    expect(get()).toMatchObject({ net: 2, roundsPlayed: 1, lastOutcomeWasLoss: false });
    expect(get().chain?.pending).toBeNull();
    expect(get().traces.at(-1)).toMatchObject({ result: "RED 3", outcome: 2 });
    // resolving twice, or the wrong round, changes nothing
    store.getState().resolveChainBet(id, 9, { kind: "settled", result: 3, staked: 2, returned: 4 });
    store.getState().resolveChainBet(id, 10, { kind: "settled", result: 3, staked: 2, returned: 0 });
    expect(get().net).toBe(2);
  });

  it("a voided or missed round is not a result", async () => {
    const { store, id, get } = await fresh();
    store.getState().approve(id);
    store.getState().beginChainBet(id, 9, rules.bets, trace);
    store.getState().resolveChainBet(id, 9, { kind: "voided", staked: 2 });
    expect(get()).toMatchObject({ net: 0, roundsPlayed: 0 });
    store.getState().beginChainBet(id, 10, rules.bets, { ...trace, roundId: 10 });
    store.getState().resolveChainBet(id, 10, { kind: "missed", why: "not included" });
    expect(get()).toMatchObject({ net: 0, roundsPlayed: 0 });
    expect(get().traces.at(-1)?.result).toBe("NOT INCLUDED");
    expect(get().log.at(-1)?.kind).toBe("skip");
  });

  it("the simulated path is unaffected: seats without a wallet ignore chain actions", async () => {
    const { useAgentSeats } = await import("./agent-seat");
    useAgentSeats.setState({ seats: {} });
    const made = useAgentSeats.getState().create({ name: "sim", owner: "practice", tableId: "practice", rules, allowance: 40, isPublic: false });
    if (!made.ok) throw new Error(made.error);
    const before = useAgentSeats.getState().seats[made.id];
    useAgentSeats.getState().beginChainBet(made.id, 1, rules.bets, trace);
    useAgentSeats.getState().markFunded(made.id);
    useAgentSeats.getState().markSwept(made.id, 1);
    expect(useAgentSeats.getState().seats[made.id]).toBe(before);
    expect(before.chain).toBeUndefined();
  });
});
