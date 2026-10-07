import { describe, expect, it } from "vitest";
import { depositBreakdown, splitAckKey } from "./deposit-split";
import { depositValueFor } from "./chain-cashier";

const SPLIT = { payoutLiquidityBps: 7000, rewardInventoryBps: 2000, protocolReserveBps: 800, platformFeeBps: 200 };
const CHIP = 30_000_000_000_000n; // 0.00003 ETH

describe("depositBreakdown", () => {
  it("100 chips: 70% comes back on cash-out, 30% does not", () => {
    const value = depositValueFor(100, CHIP, SPLIT.payoutLiquidityBps);
    const b = depositBreakdown(value, SPLIT, CHIP)!;
    expect(b.chips).toBe(100n);
    expect(b.cashOutWei).toBe(3_000_000_000_000_000n); // 0.003 ETH
    expect(b.liquidityWei + b.inventoryWei + b.reserveWei + b.feeWei).toBe(value);
    expect(b.cashOutWei + b.notReturnedWei).toBe(value);
    expect(b.cashOutBps).toBe(6999); // 70% less a wei of rounding
    expect(Number(b.inventoryWei) / Number(value)).toBeCloseTo(0.2, 6);
    expect(Number(b.reserveWei) / Number(value)).toBeCloseTo(0.08, 6);
    expect(Number(b.feeWei) / Number(value)).toBeCloseTo(0.02, 6);
  });
  it("matches the contract's integer order: dust from the liquidity share is not returned", () => {
    const b = depositBreakdown(1_000_000_000_000_001n, SPLIT, CHIP)!;
    expect(b.liquidityWei).toBe(700_000_000_000_000n);
    expect(b.chips).toBe(23n);
    expect(b.cashOutWei).toBe(690_000_000_000_000n);
    expect(b.notReturnedWei).toBe(1_000_000_000_000_001n - 690_000_000_000_000n);
  });
  it("returns null without a price or a value", () => {
    expect(depositBreakdown(0n, SPLIT, CHIP)).toBeNull();
    expect(depositBreakdown(1n, SPLIT, 0n)).toBeNull();
  });
  it("the acknowledgement key changes with the split", () => {
    expect(splitAckKey(SPLIT)).toBe("deposit-split-ack:7000/2000/800/200");
    expect(splitAckKey({ ...SPLIT, payoutLiquidityBps: 7500, rewardInventoryBps: 1500 })).not.toBe(splitAckKey(SPLIT));
  });
});
