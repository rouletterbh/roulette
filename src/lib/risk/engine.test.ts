import { describe, it, expect } from "vitest";
import { getMaximumSafeBet, checkWager, availableBankroll, splitDeposit } from "./engine";
import { straight, OUTSIDE_BETS } from "@/lib/roulette/bets";
import { maximumLiability } from "@/lib/roulette/settle";

const t = { bankroll: 100, reservedLiability: 0, claimableRewards: 0, protocolReserve: 0, safetyReserveBps: 1500, maxRoundExposureBps: 2500 };

describe("risk engine", () => {
  it("derives available bankroll net of reserves", () => {
    const { available, safety } = availableBankroll(t);
    expect(safety).toBe(15);
    expect(available).toBe(85);
  });
  it("caps max stake by multiplier", () => {
    const r = getMaximumSafeBet(t, 35);
    // exposure cap 25% of 85 = 21.25 → /35 = 0.60
    expect(r.maxRoundExposure).toBeCloseTo(21.25);
    expect(r.maxStake).toBe(0.6);
    expect(getMaximumSafeBet(t, 1).maxStake).toBe(21.25);
  });
  it("closes the table below the minimum bankroll", () => {
    const r = getMaximumSafeBet({ ...t, bankroll: 20 }, 35);
    expect(r.tableOpen).toBe(false);
    expect(r.reason).toBe("insufficient-bankroll");
  });
  it("accounts for existing liability", () => {
    const r = getMaximumSafeBet(t, 1, 20);
    expect(r.maxStake).toBeCloseTo(1.25);
  });
  it("never accepts an undercollateralized wager", () => {
    const ok = checkWager(t, [{ ...OUTSIDE_BETS.red, stake: 20 }]);
    expect(ok.ok).toBe(true);
    const bad = checkWager(t, [{ ...straight(17), stake: 1 }]); // 35 > 21.25
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("Table limit reached");
  });
  it("invariant: accepted wager liability <= exposure cap for random bet sets", () => {
    for (let i = 0; i < 500; i++) {
      const bets = Array.from({ length: 1 + (i % 5) }, (_, k) => ({ ...straight((i * 7 + k * 3) % 37), stake: ((i + k) % 4) + 0.25 }));
      const res = checkWager(t, bets);
      const liab = maximumLiability(bets).maxNetPayout;
      if (res.ok) expect(liab).toBeLessThanOrEqual(res.maxRoundExposure + 1e-9);
      else expect(liab).toBeGreaterThan(res.maxRoundExposure);
    }
  });
  it("splits deposits exactly", () => {
    const s = splitDeposit(100);
    expect(s.liquidity + s.inventory + s.reserve + s.fee).toBeCloseTo(100, 6);
    expect(s.liquidity).toBe(70);
    expect(s.inventory).toBe(20);
    expect(s.reserve).toBe(8);
    expect(s.fee).toBe(2);
  });
});
