import { describe, it, expect } from "vitest";
import { encodeBetById } from "@/lib/agent/encode-bets";
import { betFromId } from "@/lib/roulette/bets";
import { maximumLiability } from "@/lib/roulette/settle";
import { checkWagerUnits, maxRoundExposureUnits, maxSafeStakeUnits, maximumLiabilityUnits, payoutUnits } from "./units";

const bets = (...xs: Array<[string, number]>) => xs.map(([id, stake]) => encodeBetById(id, stake));

describe("integer risk mirror (RiskEngine.sol)", () => {
  it("pays stake × (multiplier + 1)", () => {
    expect(payoutUnits(5n, 35)).toBe(180n);
    expect(payoutUnits(5n, 1)).toBe(10n);
  });

  it("agrees with the float engine's maximumLiability on integer stakes", () => {
    const set: Array<[string, number]> = [["red", 10], ["straight:19", 1], ["dozen:2", 4], ["split:17-20", 2], ["corner:25", 3]];
    const a = maximumLiabilityUnits(bets(...set));
    const b = maximumLiability(set.map(([id, stake]) => ({ ...betFromId(id)!, stake })));
    expect(a.worstResult).toBe(b.worstResult);
    expect(Number(a.maxReturn)).toBe(b.maxReturn);
    expect(Number(a.maxNetPayout)).toBe(b.maxNetPayout);
  });

  it("floors the exposure cap and the max stake like Solidity", () => {
    // Mainnet on 2026-10-05: 852 units available, 25% cap → 213; ÷35 → 6.
    expect(maxRoundExposureUnits(852n, 2500)).toBe(213n);
    expect(maxSafeStakeUnits(852n, 35, 0n, 2500)).toBe(6n);
    expect(maxSafeStakeUnits(852n, 1, 0n, 2500)).toBe(213n);
    expect(maxSafeStakeUnits(852n, 35, 200n, 2500)).toBe(0n);
    expect(maxSafeStakeUnits(852n, 35, 999n, 2500)).toBe(0n);
    expect(maxSafeStakeUnits(852n, 0, 0n, 2500)).toBe(0n);
  });

  it("accepts a set at the cap and rejects one unit over", () => {
    // 6 on a straight → net 210 ≤ 213; 7 → 245 > 213.
    expect(checkWagerUnits(852n, 2500, bets(["straight:17", 6]))).toMatchObject({ ok: true, maxNetPayout: 210n, maxRoundExposure: 213n });
    expect(checkWagerUnits(852n, 2500, bets(["straight:17", 7]))).toMatchObject({ ok: false, maxNetPayout: 245n });
    expect(checkWagerUnits(852n, 2500, []).ok).toBe(false);
  });

  it("evaluates the round's whole bet set, so opposite bets offset", () => {
    const existing = bets(["red", 200]); // net 200
    expect(checkWagerUnits(852n, 2500, [...existing, ...bets(["red", 20])]).ok).toBe(false); // 220 > 213
    expect(checkWagerUnits(852n, 2500, [...existing, ...bets(["black", 20])]).ok).toBe(true); // red wins: 400 − 220 = 180
  });
});
