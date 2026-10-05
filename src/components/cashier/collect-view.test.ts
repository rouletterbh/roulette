import { describe, it, expect } from "vitest";
import { RESTOCK_NOTE, ageLabel, claimAmount, collectRow, tokenLabel, usdFloor } from "./collect-view";

const E18 = 10n ** 18n;
const MIN = E18 / 2n;
const cashcat = { symbol: "CASHCAT", enabled: true, decimals: 18, inventory: 0n, minimumPayoutUsd1e18: MIN, priceUsd1e18: 163_880_000_000_000_000n };

describe("collect rows", () => {
  it("mainnet today: registered, priced, zero inventory → disabled with the restock note, whatever the win balance", () => {
    for (const win of [0n, 5n * E18]) {
      const r = collectRow(cashcat, win);
      expect(r.claimable).toBe(false);
      expect(r.line).toBe(RESTOCK_NOTE);
      expect(r.limit.maxUsd1e18).toBe(0n);
    }
  });

  it("never offers more than inventory × price", () => {
    const r = collectRow({ ...cashcat, inventory: 10n * E18 }, 5n * E18);
    expect(r.claimable).toBe(true);
    expect(r.limit.maxUsd1e18).toBe(1_638_800_000_000_000_000n);
    // $1.6388 is shown as $1.63: a maximum is rounded down, never up past what the vault holds.
    expect(r.line).toMatch(/^Up to \$1\.63 now \(limited by vault inventory/);
    const full = collectRow({ ...cashcat, inventory: 250n * E18 }, 5n * E18);
    expect(full.line).toBe("Up to $5.00 now (your whole win balance)");
  });

  it("explains every other reason", () => {
    expect(collectRow({ ...cashcat, enabled: false, inventory: E18 }, E18).line).toMatch(/Not enabled/);
    expect(collectRow({ ...cashcat, priceUsd1e18: null, inventory: E18 }, E18).line).toMatch(/No fresh price/);
    expect(collectRow({ ...cashcat, inventory: 250n * E18 }, 0n).line).toMatch(/No win balance yet\. Convert chips above; the vault can pay up to \$40\.97 of CASHCAT/);
    expect(collectRow({ ...cashcat, inventory: 250n * E18 }, E18 / 5n).line).toMatch(/under the \$0\.50 minimum claim for CASHCAT/);
    const thin = collectRow({ ...cashcat, inventory: 2n * E18 }, 5n * E18);
    expect(thin.claimable).toBe(false);
    expect(thin.line).toMatch(/holds \$0\.32 of CASHCAT, under the \$0\.50 minimum claim\. Vault inventory is being restocked/);
  });
});

describe("claim amount", () => {
  const max = 3n * E18;
  it("defaults to the maximum and clamps what is typed", () => {
    expect(claimAmount("", max, MIN)).toEqual({ usd1e18: max, error: null });
    expect(claimAmount("  ", 0n, MIN).error).toMatch(/Nothing claimable/);
    expect(claimAmount("1.5", max, MIN)).toEqual({ usd1e18: 15n * 10n ** 17n, error: null });
    expect(claimAmount(".75", max, MIN)).toEqual({ usd1e18: 75n * 10n ** 16n, error: null });
    expect(claimAmount("3", max, MIN).error).toBeNull();
    expect(claimAmount("3.01", max, MIN)).toEqual({ usd1e18: max, error: "The most claimable right now is $3.00." });
    expect(claimAmount("0.25", max, MIN).error).toBe("The minimum claim is $0.50.");
    for (const bad of ["abc", "1e3", "-1", ".", "0", "1,5"]) expect(claimAmount(bad, max, MIN).error, bad).toBe("Enter a USD amount.");
  });
});

describe("labels", () => {
  it("rounds USD maxima down to the cent", () => {
    expect(usdFloor(1_638_800_000_000_000_000n)).toBe("$1.63");
    expect(usdFloor(1_999_999_999_999_999_999n)).toBe("$1.99");
    expect(usdFloor(5n * E18)).toBe("$5.00");
    expect(usdFloor(1_234_567n * E18 + E18 / 20n)).toBe("$1,234,567.05");
    expect(usdFloor(0n)).toBe("$0.00");
    expect(usdFloor(-5n)).toBe("$0.00");
  });

  it("formats ages and token amounts", () => {
    expect([ageLabel(0), ageLabel(59), ageLabel(60), ageLabel(369), ageLabel(7200), ageLabel(200_000), ageLabel(-5)]).toEqual(["0s", "59s", "1m", "6m", "2h", "2d", "0s"]);
    expect(tokenLabel(9_153_038_808_884_549_670n, 18)).toBe("9.153");
    expect(tokenLabel(250n * E18, 18)).toBe("250");
    expect(tokenLabel(1_999_999n, 6)).toBe("1.9999");
  });
});
