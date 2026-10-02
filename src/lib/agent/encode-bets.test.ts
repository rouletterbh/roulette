import { describe, it, expect } from "vitest";
import {
  MASK_BLACK,
  MASK_COLUMN_1,
  MASK_COLUMN_2,
  MASK_COLUMN_3,
  MASK_DOZEN_1,
  MASK_DOZEN_2,
  MASK_DOZEN_3,
  MASK_EVEN,
  MASK_HIGH,
  MASK_LOW,
  MASK_ODD,
  MASK_RED,
  encodeBet,
  encodeBetById,
  maskToHex,
  maskToNumbers,
  numbersToMask,
} from "./encode-bets";
import { OUTSIDE_BETS, betFromId, corner, sixLine, split, straight, street } from "@/lib/roulette/bets";

describe("encode-bets", () => {
  it("matches RiskEngine.sol outside-bet masks", () => {
    expect(numbersToMask(OUTSIDE_BETS.red.numbers)).toBe(MASK_RED);
    expect(numbersToMask(OUTSIDE_BETS.black.numbers)).toBe(MASK_BLACK);
    expect(MASK_RED).toBe(0x000000154aad52aan);
    expect(MASK_BLACK).toBe(0x0000000ab552ad54n);
    expect(numbersToMask(OUTSIDE_BETS.odd.numbers)).toBe(MASK_ODD);
    expect(numbersToMask(OUTSIDE_BETS.even.numbers)).toBe(MASK_EVEN);
    expect(numbersToMask(OUTSIDE_BETS.low.numbers)).toBe(MASK_LOW);
    expect(numbersToMask(OUTSIDE_BETS.high.numbers)).toBe(MASK_HIGH);
    expect(numbersToMask(OUTSIDE_BETS["dozen:1"].numbers)).toBe(MASK_DOZEN_1);
    expect(numbersToMask(OUTSIDE_BETS["dozen:2"].numbers)).toBe(MASK_DOZEN_2);
    expect(numbersToMask(OUTSIDE_BETS["dozen:3"].numbers)).toBe(MASK_DOZEN_3);
    expect(numbersToMask(OUTSIDE_BETS["column:1"].numbers)).toBe(MASK_COLUMN_1);
    expect(numbersToMask(OUTSIDE_BETS["column:2"].numbers)).toBe(MASK_COLUMN_2);
    expect(numbersToMask(OUTSIDE_BETS["column:3"].numbers)).toBe(MASK_COLUMN_3);
  });

  it("formats masks as the Solidity hex literals", () => {
    expect(maskToHex(MASK_RED)).toBe("0x000000154aad52aa");
    expect(maskToHex(MASK_BLACK)).toBe("0x0000000ab552ad54");
    expect(maskToHex(numbersToMask([0]))).toBe("0x0000000000000001");
  });

  it("round-trips inside bets through the bitmask", () => {
    for (const def of [straight(0), straight(17), split(17, 20), street(2), corner(25), sixLine(4)]) {
      expect(maskToNumbers(numbersToMask(def.numbers))).toEqual([...def.numbers]);
    }
    expect(numbersToMask([17])).toBe(1n << 17n);
    expect(numbersToMask([17, 20])).toBe((1n << 17n) | (1n << 20n));
  });

  it("encodes a placed bet into the IRiskEngine.Bet struct", () => {
    const b = encodeBet(straight(17), 5);
    expect(b).toEqual({ numbersMask: 1n << 17n, multiplier: 35, stake: 5n });
    const red = encodeBetById("red", 10);
    expect(red.numbersMask).toBe(MASK_RED);
    expect(red.multiplier).toBe(1);
    expect(red.stake).toBe(10n);
  });

  it("rejects invalid geometry, non-integer and out-of-range stakes", () => {
    expect(() => encodeBet(straight(17), 1.5)).toThrow();
    expect(() => encodeBet(straight(17), 0)).toThrow();
    expect(() => encodeBet({ ...split(1, 2), numbers: [1, 3] }, 1)).toThrow();
    expect(() => encodeBetById("nonsense", 1)).toThrow();
    expect(() => numbersToMask([37])).toThrow();
  });

  it("every valid bet id yields a mask the contract would accept", () => {
    const ids = [...Object.keys(OUTSIDE_BETS), "straight:0", "straight:36", "split:0-2", "street:34", "corner:32", "sixline:31"];
    for (const id of ids) {
      const def = betFromId(id)!;
      const mask = numbersToMask(def.numbers);
      expect(mask).toBeGreaterThan(0n);
      expect(mask).toBeLessThan(1n << 37n);
    }
  });
});
