import { describe, it, expect } from "vitest";
import { rewardRegistry } from "@/config/tokens";
import { ROUND_STATUS } from "./contracts";
import {
  buildFlowSeries,
  buildLiabilityRows,
  buildRewardRows,
  buildTableRows,
  buildTreasuryView,
  formatClock,
  formatEth,
  roundStatusLabel,
  unitsToUsd,
  weiToUnits,
  weiToUsd,
  type ChainRoundRecord,
  type TreasuryRaw,
  type VaultAssetRaw,
} from "./treasury-view";

// Mainnet deploy config: chip price 0.00003 ETH, chip USD value $0.10, bankroll 0.03 ETH.
const CHIP_PRICE = 30_000_000_000_000n;
const CHIP_USD = 10n ** 17n;
const ETH = 10n ** 18n;

const raw = (over: Partial<TreasuryRaw> = {}): TreasuryRaw => ({
  bankrollWei: (3n * ETH) / 100n, // 0.03 ETH = 1000 units = $100
  reservedWei: 0n,
  claimableWei: 0n,
  protocolReserveWei: 0n,
  safetyReserveWei: (3n * ETH) / 100n / 100n * 15n, // 15% of bankroll
  availableWei: (3n * ETH) / 100n - (3n * ETH) / 100n / 100n * 15n,
  rewardInventoryWei: 0n,
  chipPriceWei: CHIP_PRICE,
  chipUsdValue: CHIP_USD,
  safetyReserveBps: 1500,
  maxRoundExposureBps: 2500,
  isSolvent: true,
  ...over,
});

describe("peg conversions", () => {
  it("converts wei to chip units and USD at the chip peg", () => {
    expect(weiToUnits((3n * ETH) / 100n, CHIP_PRICE)).toBe(1000);
    expect(weiToUsd((3n * ETH) / 100n, CHIP_PRICE, CHIP_USD)).toBeCloseTo(100, 6);
    expect(unitsToUsd(7n, CHIP_USD)).toBeCloseTo(0.7, 9);
    expect(unitsToUsd(7, CHIP_USD)).toBeCloseTo(0.7, 9);
  });
  it("never divides by an unset price", () => {
    expect(weiToUnits(ETH, 0n)).toBe(0);
    expect(weiToUsd(ETH, 0n, CHIP_USD)).toBe(0);
  });
  it("formats ETH and clocks", () => {
    expect(formatEth((3n * ETH) / 100n)).toBe("0.03 ETH");
    expect(formatEth(0n)).toBe("0 ETH");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3661)).toBe("1:01:01");
    expect(formatClock(-4)).toBe("00:00");
  });
});

describe("buildTreasuryView", () => {
  it("mirrors the contract derivation on the mainnet launch figures", () => {
    const v = buildTreasuryView(raw());
    expect(v.hasPeg).toBe(true);
    expect(v.chipUsd).toBe(0.1);
    expect(v.bankroll.units).toBe(1000);
    expect(v.bankroll.usd).toBeCloseTo(100, 6);
    expect(v.safetyReserve.units).toBe(150);
    expect(v.available.units).toBe(850);
    // cap = 850 × 25% = 212.5 units → 212 (integer maths, as RiskEngine) ÷ 35 = 6 units
    expect(v.exposureCap.usd).toBeCloseTo(21.25, 6);
    expect(v.maxStraightUnits).toBe(6);
    expect(v.maxStraightUsd).toBeCloseTo(0.6, 9);
    expect(v.collateralizationPct).toBeNull();
    expect(v.exposurePct).toBe(0);
    expect(v.derivation.map(([k]) => k)).toEqual([
      "Bankroll",
      "− reserved liabilities",
      "− claimable rewards",
      "− protocol reserve",
      "− safety reserve (15%)",
      "= available bankroll",
      "× per-round exposure cap (25%)",
      "÷ 35 (straight-up payout)",
    ]);
    expect(v.derivation[7][1]).toBe("6 units max straight bet");
    expect(v.derivation[5][2]).toBe("sum");
    expect(v.allocation.map((p) => p.label)).toEqual(["Available liquidity", "Reserved liabilities", "Safety reserve", "Protocol reserve", "Reward inventory"]);
  });

  it("computes collateralization and exposure once liabilities exist", () => {
    const v = buildTreasuryView(raw({ reservedWei: 10n * CHIP_PRICE, claimableWei: 5n * CHIP_PRICE, availableWei: 835n * CHIP_PRICE }));
    // (1000 + 0) / 15 = 6666.67%
    expect(v.collateralizationPct).toBeCloseTo(6666.67, 1);
    expect(v.exposurePct).toBeCloseTo((10 / 835) * 100, 3);
    expect(v.liabilities.units).toBe(15);
  });

  it("falls back to ETH strings and zero USD when the peg is unknown", () => {
    const v = buildTreasuryView(raw({ chipPriceWei: 0n, chipUsdValue: 0n }));
    expect(v.hasPeg).toBe(false);
    expect(v.bankroll.usd).toBe(0);
    expect(v.derivation[0][1]).toBe("0.03 ETH");
    expect(v.derivation[7][1]).toBe("—");
  });
});

describe("rounds", () => {
  const round = (over: Partial<ChainRoundRecord>): ChainRoundRecord => ({ tableId: 1, roundId: 10n, status: ROUND_STATUS.Open, result: 0, openedAt: 1_700_000_000, betCount: 0, totalStaked: 0n, totalReturned: 0n, reservedUnits: 0n, ...over });

  it("labels statuses", () => {
    expect(roundStatusLabel(ROUND_STATUS.Open)).toBe("Open");
    expect(roundStatusLabel(ROUND_STATUS.Closed)).toBe("Closed");
    expect(roundStatusLabel(ROUND_STATUS.Settled)).toBe("Settled");
    expect(roundStatusLabel(ROUND_STATUS.Voided)).toBe("Voided");
    expect(roundStatusLabel(0)).toBe("None");
  });

  it("lists only unsettled rounds as liabilities with reserved exposure against the cap", () => {
    const rows = buildLiabilityRows(
      [
        round({ tableId: 2, roundId: 12n, status: ROUND_STATUS.Closed, betCount: 3, totalStaked: 9n, reservedUnits: 70n }),
        round({ tableId: 1, roundId: 11n, status: ROUND_STATUS.Settled, reservedUnits: 0n }),
        round({ tableId: 3, roundId: 13n, status: ROUND_STATUS.Open, betCount: 1, totalStaked: 2n, reservedUnits: 35n }),
      ],
      212,
      CHIP_USD,
    );
    expect(rows.map((r) => r.tableId)).toEqual([2, 3]);
    expect(rows[0]).toMatchObject({ roundId: 12n, status: "Closed", betCount: 3, totalStakedUnits: 9, reservedUnits: 70 });
    expect(rows[0].reservedUsd).toBeCloseTo(7, 9);
    expect(rows[0].pctOfCap).toBeCloseTo((70 / 212) * 100, 6);
    expect(buildLiabilityRows([round({ reservedUnits: 1n })], 0, CHIP_USD)[0].pctOfCap).toBeNull();
    expect(buildLiabilityRows([round({ status: ROUND_STATUS.Voided })], 212, CHIP_USD)).toEqual([]);
  });

  it("builds table rows from chain tables, keeps the newest round per table and routes the default table to quick play", () => {
    const rows = buildTableRows(
      [
        { id: 1, minStake: 1n, maxStake: 500n, isPrivate: false, active: true },
        { id: 2, minStake: 1n, maxStake: 5n, isPrivate: false, active: false },
        { id: 3, minStake: 1n, maxStake: 50n, isPrivate: true, active: true },
      ],
      [round({ tableId: 1, roundId: 4n, status: ROUND_STATUS.Settled, result: 17 }), round({ tableId: 1, roundId: 5n, status: ROUND_STATUS.Open, openedAt: 1000 })],
      { maxStraightUnits: 6, roundTimeout: 86_400, defaultTableId: 1 },
    );
    expect(rows.map((r) => r.id)).toEqual([1, 2]); // private table omitted
    expect(rows[0]).toMatchObject({ name: "Table 1", minStake: 1, maxStake: 500, effectiveMaxStraight: 6, treasuryLimited: true, href: "/play/quick" });
    expect(rows[0].round).toMatchObject({ roundId: 5n, status: "Open", timesOutAt: 1000 + 86_400, result: null });
    expect(rows[1]).toMatchObject({ active: false, effectiveMaxStraight: 5, treasuryLimited: false, href: "/table/2", round: null });
  });
});

describe("rewards", () => {
  const cashcat = rewardRegistry.find((t) => t.symbol === "CASHCAT")!;
  const vault = (over: Partial<VaultAssetRaw> = {}): VaultAssetRaw => ({ registered: true, enabled: true, decimals: 18, status: 2, inventory: 250n * ETH, minimumPayoutUsd: 5n * 10n ** 17n, priceUsd1e18: 160_111_000_000_000_000n, ...over });

  it("maps vault reads onto the registry and keeps unlisted assets honest", () => {
    const rows = buildRewardRows(new Map([[cashcat.contractAddress!.toLowerCase(), vault()]]));
    const cc = rows.find((r) => r.token.id === cashcat.id)!;
    expect(cc).toMatchObject({ status: "available", statusLabel: "Available", inventoryTokens: 250, minimumPayoutUsd: 0.5 });
    expect(cc.priceUsd).toBeCloseTo(0.160111, 9);
    expect(cc.inventoryUsd).toBeCloseTo(40.03, 2);
    const nvda = rows.find((r) => r.token.id === "stock-nvda")!;
    expect(nvda).toMatchObject({ status: "unverified", statusLabel: "Not yet listed", inventoryTokens: null, priceUsd: null, inventoryUsd: null });
    const pons = rows.find((r) => r.token.symbol === "PONS")!; // has an address but no vault read supplied
    expect(pons).toMatchObject({ status: "unavailable", statusLabel: "Temporarily unavailable", inventoryTokens: null });
  });

  it("shows no USD when the oracle has no fresh price and unavailable when the vault is empty", () => {
    const rows = buildRewardRows(new Map([[cashcat.contractAddress!.toLowerCase(), vault({ status: 0, inventory: 0n, priceUsd1e18: undefined })]]), [cashcat]);
    expect(rows[0]).toMatchObject({ status: "unavailable", statusLabel: "Temporarily unavailable", inventoryTokens: 0, priceUsd: null, inventoryUsd: null });
    // Registered: false (the vault has no config for the address, e.g. RBL before RegisterRbl runs) is "Not yet
    // listed", not "Temporarily unavailable": nothing is temporarily missing, the asset simply is not on the vault.
    const unregistered = buildRewardRows(new Map([[cashcat.contractAddress!.toLowerCase(), vault({ registered: false, status: undefined })]]), [cashcat]);
    expect(unregistered[0]).toMatchObject({ status: "unverified", statusLabel: "Not yet listed", inventoryTokens: null, priceUsd: null, inventoryUsd: null });
    expect(unregistered[0].minimumPayoutUsd).toBe(cashcat.minimumPayout);
  });
});

describe("buildFlowSeries", () => {
  it("turns RoundSettled events into per-round USD points, oldest first, with totals over every log", () => {
    const logs = Array.from({ length: 35 }, (_, i) => ({ roundId: BigInt(35 - i), result: i % 37, totalStaked: 10n, totalReturned: BigInt(i % 3 === 0 ? 20 : 0), blockNumber: BigInt(100 + i) }));
    const s = buildFlowSeries(logs, CHIP_USD);
    expect(s.rounds).toBe(35);
    expect(s.points).toHaveLength(30);
    expect(s.points[0].day).toBe("#6");
    expect(s.points[29].day).toBe("#35");
    expect(s.points[0].wagers).toBeCloseTo(1, 9);
    expect(s.wagersUsd).toBeCloseTo(35, 9);
    expect(s.payoutsUsd).toBeCloseTo(12 * 2, 9);
  });
  it("is empty without logs", () => {
    expect(buildFlowSeries([], CHIP_USD)).toEqual({ points: [], wagersUsd: 0, payoutsUsd: 0, rounds: 0 });
  });
});
