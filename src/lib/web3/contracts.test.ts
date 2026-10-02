import { describe, it, expect } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import { betFromId } from "@/lib/roulette/bets";
import { MASK_RED } from "@/lib/agent/encode-bets";
import { balancesFromBatch, chipIdToDenomination, chipUnits, resolveChainTableId, rouletteGameAbi, selectAllChips, selectChips, slipToContractBets, toPlaceBetsArgs } from "./contracts";

describe("placeBets encoding", () => {
  it("round-trips a slip through the contract tuple ABI", () => {
    const bets = [{ ...betFromId("straight:17")!, stake: 5 }, { ...betFromId("red")!, stake: 10 }, { ...betFromId("split:17-20")!, stake: 2 }];
    const [roundId, tuples] = toPlaceBetsArgs(77n, bets);
    expect(roundId).toBe(77n);
    expect(tuples).toEqual([
      { numbersMask: 1n << 17n, multiplier: 35, stake: 5n },
      { numbersMask: MASK_RED, multiplier: 1, stake: 10n },
      { numbersMask: (1n << 17n) | (1n << 20n), multiplier: 17, stake: 2n },
    ]);
    const data = encodeFunctionData({ abi: rouletteGameAbi, functionName: "placeBets", args: [roundId, [...tuples]] });
    const decoded = decodeFunctionData({ abi: rouletteGameAbi, data });
    expect(decoded.functionName).toBe("placeBets");
    expect(decoded.args).toEqual([77n, tuples]);
  });

  it("encodes a {betId → stake} slip and rejects unknown ids", () => {
    expect(slipToContractBets({ black: 3, "straight:0": 1, nothing: 0 })).toEqual([
      { numbersMask: expect.any(BigInt), multiplier: 1, stake: 3n },
      { numbersMask: 1n, multiplier: 35, stake: 1n },
    ]);
    expect(() => slipToContractBets({ bogus: 1 })).toThrow(/Unknown bet id/);
  });
});

describe("chip helpers", () => {
  it("maps balanceOfBatch output to units", () => {
    const b = balancesFromBatch([3n, 1n, 0n, 2n, 0n, 1n]);
    expect(b).toEqual({ 1: 3n, 5: 1n, 10: 0n, 25: 2n, 50: 0n, 100: 1n });
    expect(chipUnits(b)).toBe(3 + 5 + 50 + 100);
    expect(chipIdToDenomination(1025n)).toBe(25);
    expect(chipIdToDenomination(1003n)).toBeNull();
  });

  it("selects chips greedily by largest denomination", () => {
    const b = { 1: 4n, 5: 2n, 10: 1n, 25: 0n, 50: 1n, 100: 0n };
    expect(selectChips(b, 67)).toEqual({ ids: [1050n, 1010n, 1005n, 1001n], amounts: [1n, 1n, 1n, 2n], units: 67, exact: true });
    expect(selectAllChips(b)).toMatchObject({ units: 74, exact: true });
    // 3 units with only 5-chips: not representable
    expect(selectChips({ 1: 0n, 5: 2n, 10: 0n, 25: 0n, 50: 0n, 100: 0n }, 3)).toEqual({ ids: [], amounts: [], units: 0, exact: false });
    expect(selectChips({ 1: 0n, 5: 2n, 10: 0n, 25: 0n, 50: 0n, 100: 0n }, 8)).toMatchObject({ ids: [1005n], amounts: [1n], units: 5, exact: false });
  });

  it("resolves chain table ids", () => {
    expect(resolveChainTableId("3")).toBe(3);
    expect(resolveChainTableId("main")).toBe(1);
    expect(resolveChainTableId(undefined)).toBe(1);
  });
});
