import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGame } from "./game";

vi.mock("@/lib/sound/engine", () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));

const g = () => useGame.getState();

describe("game store round lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    g().init("practice", 100);
  });

  it("starts with a commitment and no bets", () => {
    expect(g().phase).toBe("betting");
    expect(g().commitment?.commitment).toMatch(/^0x[0-9a-f]{64}$/);
    expect(g().placedBets()).toEqual([]);
  });

  it("adds, undoes, doubles and clears bets", () => {
    g().selectChip(5);
    g().addBet("straight:17");
    g().addBet("straight:17");
    g().addBet("red");
    expect(g().bets).toEqual({ "straight:17": 10, red: 5 });
    g().undo();
    expect(g().bets).toEqual({ "straight:17": 10 });
    g().double();
    expect(g().bets).toEqual({ "straight:17": 20 });
    g().clear();
    expect(g().bets).toEqual({});
  });

  it("rejects bets beyond balance and beyond the table limit", () => {
    g().selectChip(50);
    g().addBet("red");
    g().addBet("red");
    g().addBet("red"); // 150 > 100 balance
    expect(g().error).toBe("Insufficient chips");
    expect(g().totalWager()).toBe(100);
    g().clear();
    useGame.setState({ treasury: { bankroll: 100, reservedLiability: 0, claimableRewards: 0, protocolReserve: 0, safetyReserveBps: 1500, maxRoundExposureBps: 2500 } });
    g().selectChip(1);
    g().addBet("straight:17"); // liability 35 > cap 21.25
    expect(g().error).toBe("Table limit reached");
    expect(g().bets).toEqual({});
  });

  it("closes, spins, settles once and reserves/releases liability", () => {
    g().selectChip(5);
    g().addBet("straight:17");
    g().addBet("black");
    const before = g().treasury.reservedLiability;
    g().placeBets();
    expect(g().phase).toBe("closed");
    expect(g().balance).toBe(90);
    expect(g().pendingReveal?.result).toBeGreaterThanOrEqual(0);
    expect(g().treasury.reservedLiability).toBeGreaterThan(before);
    vi.advanceTimersByTime(1000);
    expect(g().phase).toBe("spinning");
    g().onSpinComplete();
    expect(g().phase).toBe("result");
    const balanceAfter = g().balance;
    const result = g().lastRound!.result;
    const expectedReturn = (result === 17 ? 180 : 0) + (g().lastRound!.settlement.lines.find((l) => l.betId === "black")!.won ? 10 : 0);
    expect(balanceAfter).toBe(90 + expectedReturn);
    expect(g().treasury.reservedLiability).toBe(before);
    expect(g().lastRound!.reveal.verified).toBe(true);
    // settling twice is a no-op
    g().onSpinComplete();
    expect(g().balance).toBe(balanceAfter);
    expect(g().rounds.length).toBe(1);
    // next round gets a fresh commitment
    const c1 = g().commitment!.commitment;
    g().nextRound();
    expect(g().phase).toBe("betting");
    expect(g().roundId).toBe(2);
    expect(g().commitment!.commitment).not.toBe(c1);
    expect(g().lastBets).toEqual({ "straight:17": 5, black: 5 });
  });

  it("cannot place or modify bets after the round closes", () => {
    g().selectChip(1);
    g().addBet("red");
    g().placeBets();
    g().addBet("black");
    g().undo();
    g().clear();
    expect(g().bets).toEqual({ red: 1 });
    expect(g().phase).toBe("closed");
  });

  it("repeat restores the last round's bets", () => {
    g().selectChip(2);
    g().addBet("odd");
    g().placeBets();
    vi.advanceTimersByTime(1000);
    g().onSpinComplete();
    g().nextRound();
    g().repeat();
    expect(g().bets).toEqual({ odd: 2 });
  });

  it("max safe raises the last bet to the collateralized maximum", () => {
    useGame.setState({ treasury: { bankroll: 1000, reservedLiability: 0, claimableRewards: 0, protocolReserve: 0, safetyReserveBps: 0, maxRoundExposureBps: 1000 } });
    g().selectChip(1);
    g().addBet("red"); // cap = 100, multiplier 1 → 100, but balance is 100
    g().maxSafe();
    expect(g().bets.red).toBe(100);
  });

  it("live mode locks the slip and lets the table close the round", () => {
    g().init("live", 50);
    g().selectChip(5);
    g().addBet("red");
    g().placeBets();
    expect(g().phase).toBe("betting");
    expect(g().betsLocked).toBe(true);
    g().closeRound();
    expect(g().phase).toBe("closed");
    expect(g().balance).toBe(45);
  });

  it("spectating a round (no bets) settles without changing balance or stats", () => {
    g().init("live", 50);
    g().closeRound();
    vi.advanceTimersByTime(1000);
    g().onSpinComplete();
    expect(g().balance).toBe(50);
    expect(g().stats.spins).toBe(0);
    expect(g().recent.length).toBe(1);
  });
});
