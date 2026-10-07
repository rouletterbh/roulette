import { describe, expect, it } from "vitest";
import { selectChips, emptyChipBalances, type ChipBalances } from "@/lib/web3/contracts";
import { AGENT_CAPS, evaluateCondition, validateRules, type AgentSeat } from "@/store/agent-seat";
import { betFromId } from "@/lib/roulette/bets";
import { QUICK_EDGE_LINE, QUICK_STYLES, budgetCandidates, denominationNote, plainStatus, quickLimits, quickRules, quickStyle, quickSummary, unitBudgetOptions, walletBudgetPlan, winChanceLabel } from "./quick-start";

const wallet = (over: Partial<ChipBalances>): ChipBalances => ({ ...emptyChipBalances(), ...over });

describe("quick-start styles", () => {
  it("are four presets of the existing rules model, each with a valid bet", () => {
    expect(QUICK_STYLES.map((s) => s.title)).toEqual(["Red or black", "Wait for a streak", "Dozens", "One number"]);
    for (const s of QUICK_STYLES) expect(betFromId(s.betId)).toBeTruthy();
    expect(quickStyle("one-number")?.betId).toBe("straight:17");
    expect(quickStyle("dozens")?.betId).toBe("dozen:1");
  });

  it("states the win chance and payout plainly", () => {
    expect(winChanceLabel(18)).toBe("18 in 37 (48.6%)");
    expect(winChanceLabel(12)).toBe("12 in 37 (32.4%)");
    expect(winChanceLabel(1)).toBe("1 in 37 (2.7%)");
    expect(QUICK_STYLES.map((s) => s.payout)).toEqual(["1:1", "1:1", "2:1", "35:1"]);
    // Payout and win chance agree: every style returns 36/37 of what it bets.
    for (const s of QUICK_STYLES) expect((s.wins * (betFromId(s.betId)!.multiplier + 1)) / 37).toBeCloseTo(36 / 37, 10);
  });

  it("the streak style waits for 3 reds in the last 3 rounds and says streaks do not change the odds", () => {
    const s = quickStyle("streak")!;
    expect(s.condition).toEqual({ type: "color-count", side: "red", window: 3, min: 3 });
    expect(s.cadence).toBe("after-condition");
    expect(evaluateCondition(s.condition, [1, 3, 5]).matched).toBe(true); // three reds
    expect(evaluateCondition(s.condition, [1, 2, 3]).matched).toBe(false);
    expect(s.note).toMatch(/do not change the odds/);
  });

  it("copy never claims an agent improves returns", () => {
    const all = [QUICK_EDGE_LINE, ...QUICK_STYLES.flatMap((s) => [s.title, s.description, s.note ?? ""])].join(" ");
    expect(all).not.toMatch(/demo|profit|earn|improve|beat/i);
    expect(QUICK_EDGE_LINE).toContain("2.7%");
  });
});

describe("derived limits", () => {
  it("stake 1, stop-loss = budget, rounds = budget × 4 within [10, 200], 60 minutes, max bet 1, no stop-win", () => {
    expect(quickLimits(25)).toEqual({ maxBet: 1, maxRounds: 100, stopLoss: 25, stopWin: null, timeLimitMinutes: 60 });
    expect(quickLimits(1).maxRounds).toBe(10);
    expect(quickLimits(2).maxRounds).toBe(10);
    expect(quickLimits(50).maxRounds).toBe(200);
    expect(quickLimits(1000).maxRounds).toBe(200);
  });

  it("every style × budget passes the seat validation under the quick cap (whole wallet) and the 50% cap at twice the budget", () => {
    for (const s of QUICK_STYLES) {
      for (const budget of [1, 5, 10, 25, 50, 65, 100, 1000]) {
        const rules = quickRules(s, budget);
        expect(rules.bets).toEqual([{ betId: s.betId, stake: 1 }]);
        expect(validateRules(rules, budget, budget, "in your wallet", AGENT_CAPS.quickAllowanceShareOfBalance)).toBeNull();
        expect(validateRules(rules, budget, budget * 2)).toBeNull();
      }
    }
  });

  it("the whole wallet is refused under the advanced builder's 50% cap, accepted under the quick cap", () => {
    const rules = quickRules(QUICK_STYLES[0], 50);
    expect(validateRules(rules, 50, 50, "in your wallet")).toMatch(/50%/);
    expect(validateRules(rules, 50, 50, "in your wallet", AGENT_CAPS.quickAllowanceShareOfBalance)).toBeNull();
    expect(validateRules(rules, 51, 50, "in your wallet", AGENT_CAPS.quickAllowanceShareOfBalance)).toMatch(/may not exceed the chips in your wallet/);
  });

  it("summary sentence", () => {
    expect(quickSummary(25)).toBe("Plays up to 100 rounds or 1 hour. Stops when the 25 chips are gone or you press Stop. Whatever is left comes back to your wallet.");
    expect(quickSummary(1)).toContain("the 1 chip is gone");
    expect(quickSummary(25, true)).toContain("Practice chips only");
  });
});

describe("budget options from wallet chips", () => {
  it("a wallet with a single 50 chip can only send all 50", () => {
    const plan = walletBudgetPlan(wallet({ 50: 1n }), 0);
    expect(plan.kind).toBe("all-only");
    expect(plan.options).toEqual([{ units: 50, label: "All 50 chips", all: true }]);
    expect(denominationNote(wallet({ 50: 1n }))).toContain("1 × 50");
  });

  it("mixed denominations: round numbers the chips make exactly, plus All", () => {
    const b = wallet({ 1: 5n, 5: 3n, 10: 2n, 25: 1n }); // 65
    const plan = walletBudgetPlan(b, 0);
    expect(plan.kind).toBe("options");
    expect(plan.options.map((o) => o.label)).toEqual(["5 chips", "10 chips", "25 chips", "50 chips", "All 65 chips"]);
    for (const o of plan.options) expect(selectChips(b, o.units).exact).toBe(true);
  });

  it("skips amounts the denominations cannot make, never exceeds the wallet, and offers at most 5", () => {
    const b = wallet({ 10: 2n, 1: 3n }); // 23: 5 and 25 are impossible
    const plan = walletBudgetPlan(b, 0);
    expect(plan.options.map((o) => o.units)).toEqual([10, 20, 23]);
    const big = wallet({ 100: 30n, 50: 1n, 25: 3n, 10: 4n, 5: 2n, 1: 7n });
    const opts = walletBudgetPlan(big, 0).options;
    expect(opts.length).toBeLessThanOrEqual(5);
    for (const o of opts) {
      expect(o.units).toBeLessThanOrEqual(3182);
      expect(selectChips(big, o.units).exact).toBe(true);
    }
    expect(opts.at(-1)).toEqual({ units: 3182, label: "All 3,182 chips", all: true });
  });

  it("only 100-chips: round hundreds", () => {
    expect(walletBudgetPlan(wallet({ 100: 3n }), 0).options.map((o) => o.units)).toEqual([100, 200, 300]);
  });

  it("zero chips: empty, or escrow-only when chips sit at a table", () => {
    expect(walletBudgetPlan(wallet({}), 0)).toEqual({ kind: "empty", options: [] });
    expect(walletBudgetPlan(wallet({}), 45)).toEqual({ kind: "escrow-only", escrow: 45, options: [] });
  });

  it("budgetCandidates prefers round numbers", () => {
    expect(budgetCandidates(1000, () => true, 4)).toEqual([5, 25, 100, 500]);
    expect(budgetCandidates(3, () => true, 4)).toEqual([1, 2]);
    expect(budgetCandidates(3, () => false, 4)).toEqual([]);
  });
});

describe("budget options for practice balances", () => {
  it("round numbers up to half the balance", () => {
    expect(unitBudgetOptions(1000, 0.5).map((o) => o.units)).toEqual([5, 25, 50, 250, 500]);
    expect(unitBudgetOptions(250, 0.5).map((o) => o.units)).toEqual([5, 10, 25, 50, 100]);
    expect(unitBudgetOptions(6, 0.5).map((o) => o.units)).toEqual([3]);
    expect(unitBudgetOptions(1, 0.5)).toEqual([]);
  });
});

describe("plain status", () => {
  const seat = (over: Partial<AgentSeat>) => ({ status: "active", lastRoundId: 4821, decisions: 3, allowance: 25, net: -3, stoppedReason: null, ...over }) as AgentSeat;
  it("leads with what the agent is doing", () => {
    expect(plainStatus(seat({}))).toBe("Playing · round #4821 · 3 bets so far · 22 chips left");
    expect(plainStatus(seat({ lastRoundId: null, decisions: 1, net: -24 }))).toBe("Playing · waiting for the next round · 1 bet so far · 1 chip left");
    expect(plainStatus(seat({ status: "paused" }))).toBe("Paused · 3 bets so far · 22 chips left");
    expect(plainStatus(seat({ status: "stopped", stoppedReason: "Stopped by owner." }))).toBe("Stopped · Stopped by owner · 3 bets so far");
    expect(plainStatus(seat({ status: "pending-approval", chain: { address: "0x1", fundedAt: null, pending: null, sweptAt: null } }))).toMatch(/waiting for you to fund it/);
  });
});
