import { describe, expect, it } from "vitest";
import { AGENT_GAS_FLOAT_WEI, betCostWei, betsCoveredBy, canAffordAnotherBet, exitReserveWei, formatEth } from "./gas";

describe("agent gas budget", () => {
  const gwei002 = 20_000_000n; // 0.02 gwei, the Robinhood Chain floor when measured

  it("the default float covers set-up, dozens of bets and the exit at the measured gas price", () => {
    expect(AGENT_GAS_FLOAT_WEI).toBe(300_000_000_000_000n);
    expect(betsCoveredBy(AGENT_GAS_FLOAT_WEI, gwei002)).toBeGreaterThanOrEqual(30);
    expect(betsCoveredBy(AGENT_GAS_FLOAT_WEI, gwei002 * 100n)).toBe(0);
    expect(betsCoveredBy(AGENT_GAS_FLOAT_WEI, 0n)).toBe(0);
  });

  it("keeps the exit reserve back", () => {
    const reserve = exitReserveWei(gwei002);
    expect(canAffordAnotherBet(reserve + betCostWei(gwei002), gwei002)).toBe(true);
    expect(canAffordAnotherBet(reserve + betCostWei(gwei002) - 1n, gwei002)).toBe(false);
    expect(canAffordAnotherBet(0n, gwei002)).toBe(false);
  });

  it("formats ETH without trailing zeros", () => {
    expect(formatEth(300_000_000_000_000n)).toBe("0.0003");
    expect(formatEth(0n)).toBe("0");
    expect(formatEth(1_234_567_890_000_000_000n, 4)).toBe("1.2345");
  });
});
