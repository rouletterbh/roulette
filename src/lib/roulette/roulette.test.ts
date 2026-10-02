import { describe, it, expect } from "vitest";
import { WHEEL_ORDER, colorOf, RED_NUMBERS } from "./constants";
import { OUTSIDE_BETS, straight, split, corner, street, sixLine, isValidBet, betFromId, PAYOUT } from "./bets";
import { settleBets, maximumLiability } from "./settle";

describe("wheel", () => {
  it("has 37 unique pockets 0..36", () => {
    expect(WHEEL_ORDER.length).toBe(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });
  it("has 18 red, 18 black, 1 green", () => {
    const counts = { red: 0, black: 0, green: 0 };
    for (let n = 0; n <= 36; n++) counts[colorOf(n)]++;
    expect(counts).toEqual({ red: 18, black: 18, green: 1 });
    expect(RED_NUMBERS.size).toBe(18);
  });
});

describe("bets", () => {
  it("outside bets cover the right counts", () => {
    expect(OUTSIDE_BETS.red.numbers.length).toBe(18);
    expect(OUTSIDE_BETS["dozen:2"].numbers).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(OUTSIDE_BETS["column:1"].numbers).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
    for (const b of Object.values(OUTSIDE_BETS)) expect(isValidBet(b)).toBe(true);
  });
  it("validates inside bet geometry", () => {
    expect(isValidBet(straight(17))).toBe(true);
    expect(isValidBet(split(17, 20))).toBe(true);
    expect(isValidBet(split(17, 18))).toBe(true);
    expect(isValidBet(split(18, 19))).toBe(false); // 18 is top row, 19 is bottom of next column
    expect(isValidBet(corner(17))).toBe(true);
    expect(isValidBet(corner(18))).toBe(false);
    expect(isValidBet(street(6))).toBe(true);
    expect(isValidBet(sixLine(11))).toBe(true);
    expect(isValidBet({ ...straight(5), multiplier: 36 })).toBe(false);
  });
  it("round-trips ids", () => {
    for (const id of ["straight:0", "split:17-20", "corner:17", "street:16", "sixline:31", "red", "dozen:3", "column:2"]) {
      expect(betFromId(id)?.id).toBe(id);
    }
    expect(betFromId("nope")).toBeNull();
  });
  it("uses standard European payouts", () => {
    expect(PAYOUT).toEqual({ straight: 35, split: 17, street: 11, corner: 8, sixline: 5, column: 2, dozen: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 });
  });
});

describe("settlement", () => {
  it("pays straight 35:1 plus stake", () => {
    const s = settleBets([{ ...straight(17), stake: 5 }], 17);
    expect(s.totalReturned).toBe(180);
    expect(s.netProfit).toBe(175);
  });
  it("loses stake on miss", () => {
    const s = settleBets([{ ...straight(17), stake: 5 }, { ...OUTSIDE_BETS.red, stake: 10 }], 20);
    expect(s.totalReturned).toBe(0);
    expect(s.netProfit).toBe(-15);
  });
  it("mixes wins and losses", () => {
    const s = settleBets([{ ...straight(17), stake: 5 }, { ...OUTSIDE_BETS.red, stake: 10 }], 32);
    expect(s.totalReturned).toBe(20);
    expect(s.netProfit).toBe(5);
  });
  it("zero loses all outside bets", () => {
    const bets = Object.values(OUTSIDE_BETS).map((b) => ({ ...b, stake: 1 }));
    expect(settleBets(bets, 0).totalReturned).toBe(0);
  });
  it("computes maximum liability across all outcomes", () => {
    const bets = [{ ...straight(17), stake: 5 }, { ...OUTSIDE_BETS.red, stake: 10 }];
    const m = maximumLiability(bets);
    expect(m.worstResult).toBe(17);
    expect(m.maxReturn).toBe(180); // 17 is black; red loses
    expect(m.maxNetPayout).toBe(165);
  });
  it("house edge over all outcomes is 1/37 for even-money bets", () => {
    let ev = 0;
    for (let n = 0; n <= 36; n++) ev += settleBets([{ ...OUTSIDE_BETS.red, stake: 1 }], n).netProfit;
    expect(ev / 37).toBeCloseTo(-1 / 37, 10);
  });
});
