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
