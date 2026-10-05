import { describe, it, expect } from "vitest";
import { claimLimit, convertBackingWei, convertCreditUsd1e18, deadlineIn, inventoryValueUsd1e18, pegCoverageBps, tokensForUsd, withSlippage } from "./claim-math";

const E18 = 10n ** 18n;
/** Mainnet values on 2026-10-05: chip peg $0.10, chip price 0.00003 ETH, CASHCAT at $0.16388, minimum payout $0.50. */
const CHIP_USD = E18 / 10n;
const CHIP_PRICE = 30_000_000_000_000n;
const PRICE = 163_880_000_000_000_000n;
const MIN = E18 / 2n;
const base = { winBalanceUsd1e18: 5n * E18, inventory: 250n * E18, priceUsd1e18: PRICE, decimals: 18, minimumPayoutUsd1e18: MIN, enabled: true };

describe("convert maths (CasinoTreasury.convertToRewards)", () => {
  it("credits units × chipUsdValue and earmarks units × chipPriceWei", () => {
    expect(convertCreditUsd1e18(50, CHIP_USD)).toBe(5n * E18);
    expect(convertCreditUsd1e18(50n, CHIP_USD)).toBe(5n * E18);
    expect(convertBackingWei(50, CHIP_PRICE)).toBe(1_500_000_000_000_000n);
    expect(convertCreditUsd1e18(0, CHIP_USD)).toBe(0n);
    expect(convertCreditUsd1e18(-3, CHIP_USD)).toBe(0n);
    expect(convertCreditUsd1e18(7.9, CHIP_USD)).toBe(7n * CHIP_USD);
    expect(convertBackingWei(5, 0n)).toBe(0n);
  });

  it("states the peg gap: claimable ETH covers the USD credit only above ETH = chipUsdValue ÷ chipPriceWei", () => {
    // $0.10 ÷ 0.00003 ETH = $3,333.33 per ETH for the claimable earmark alone.
    expect(pegCoverageBps(CHIP_PRICE, CHIP_USD, 3_334n * E18)).toBeGreaterThanOrEqual(10_000);
    expect(pegCoverageBps(CHIP_PRICE, CHIP_USD, 2_670n * E18)).toBe(8010);
    expect(pegCoverageBps(CHIP_PRICE, 0n, 2_670n * E18)).toBe(0);
  });
});

describe("claim limit (RewardVault.claimAs)", () => {
  it("values inventory and quotes tokens with the vault's integer maths", () => {
    expect(inventoryValueUsd1e18(250n * E18, PRICE, 18)).toBe(40_970_000_000_000_000_000n);
    expect(inventoryValueUsd1e18(250_000_000n, PRICE, 6)).toBe(40_970_000_000_000_000_000n);
    expect(inventoryValueUsd1e18(0n, PRICE, 18)).toBe(0n);
    expect(tokensForUsd(15n * E18 / 10n, PRICE, 18)).toBe(9_153_038_808_884_549_670n);
    expect(tokensForUsd(E18, 0n, 18)).toBe(0n);
  });

  it("is the win balance when the vault can cover it", () => {
    expect(claimLimit(base)).toEqual({ maxUsd1e18: 5n * E18, inventoryUsd1e18: 40_970_000_000_000_000_000n, limitedBy: "win-balance", blocker: null });
  });

  it("is capped by inventory × price, and that amount never needs more tokens than the vault holds", () => {
    const l = claimLimit({ ...base, inventory: 10n * E18 });
    expect(l).toMatchObject({ maxUsd1e18: 1_638_800_000_000_000_000n, limitedBy: "inventory", blocker: null });
    expect(tokensForUsd(l.maxUsd1e18, PRICE, 18)).toBeLessThanOrEqual(10n * E18);
    // An awkward price: flooring still keeps the claim within inventory.
    const odd = claimLimit({ ...base, inventory: 7_777_777_777_777_777_777n, priceUsd1e18: 398_201_000_000_000_003n });
    expect(tokensForUsd(odd.maxUsd1e18, 398_201_000_000_000_003n, 18)).toBeLessThanOrEqual(7_777_777_777_777_777_777n);
  });

  it("names the reason when nothing is claimable, asset state before the caller's balance", () => {
    expect(claimLimit({ ...base, enabled: false }).blocker).toBe("not-enabled");
    expect(claimLimit({ ...base, priceUsd1e18: null }).blocker).toBe("no-price");
    expect(claimLimit({ ...base, priceUsd1e18: undefined, inventory: 0n }).blocker).toBe("no-price");
    expect(claimLimit({ ...base, inventory: 0n })).toMatchObject({ maxUsd1e18: 0n, blocker: "no-inventory", inventoryUsd1e18: 0n });
    expect(claimLimit({ ...base, inventory: 0n, winBalanceUsd1e18: 0n }).blocker).toBe("no-inventory");
    expect(claimLimit({ ...base, winBalanceUsd1e18: 0n }).blocker).toBe("no-balance");
    // $0.40 of win balance, or $0.33 of inventory, is under the $0.50 minimum.
    expect(claimLimit({ ...base, winBalanceUsd1e18: (4n * E18) / 10n })).toMatchObject({ maxUsd1e18: 0n, blocker: "below-minimum", limitedBy: "win-balance" });
    expect(claimLimit({ ...base, inventory: 2n * E18 })).toMatchObject({ maxUsd1e18: 0n, blocker: "below-minimum", limitedBy: "inventory" });
  });
});

describe("slippage and deadline", () => {
  it("keeps the existing defaults", () => {
    expect(withSlippage(10_000n)).toBe(9_950n);
    expect(withSlippage(10_000n, 100)).toBe(9_900n);
    expect(deadlineIn(10, 1_000_000)).toBe(1_600n);
  });
});
