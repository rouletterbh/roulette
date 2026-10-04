// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ROUND_STATUS } from "@/lib/web3/contracts";
import { PAYOUT } from "@/lib/roulette/bets";
import { commit, deriveResult } from "@/lib/fairness/commit-reveal";
import { MASK_RED, betIdFromContract, encodeBetById } from "./encode-bets";
import { ADDR, CASHCAT, NOW, PLAYER, PONS, account, asset, game, head, openRound, round109, round109Bets, table1, treasury } from "./__fixtures__/chain";
import { accountView, betView, idJson, limitsView, pauseView, pricesView, rewardsView, roundView, scanWindowView, statsView, tableClosedReason, tableView, treasuryView, verifyBody } from "./chain-views";

describe("idJson / pauseView / scanWindowView", () => {
  it("keeps exact ids as numbers and falls back to strings beyond 2^53", () => {
    expect(idJson(109n)).toBe(109);
    expect(idJson(2n ** 60n)).toBe((2n ** 60n).toString());
  });
  it("decodes pause bit flags", () => {
    expect(pauseView(0)).toEqual({ flags: 0, deposits: false, gameplay: false, claims: false, withdrawals: false });
    expect(pauseView(2 | 4)).toMatchObject({ gameplay: true, claims: true, deposits: false });
    expect(pauseView(null)).toBeNull();
  });
  it("states the block window and its approximate length", () => {
    expect(scanWindowView({ fromBlock: 80_260_222n, toBlock: 80_320_222n })).toEqual({ fromBlock: 80_260_222, toBlock: 80_320_222, blocks: 60_000, approxMinutes: 100 });
  });
});

describe("treasuryView", () => {
  const v = treasuryView(treasury(), game(), [], head);

  it("reports chip units from the chain buckets, with wei and peg-derived USD alongside", () => {
    expect(v.unit).toBe("chip units");
    expect(v.usdBasis).toMatch(/peg-derived/);
    expect(v.peg).toEqual({ hasPeg: true, chipPriceWei: "30000000000000", chipUsd: 0.1 });
    expect(v.snapshot).toMatchObject({ bankroll: 1016, reservedLiability: 0, claimableRewards: 0, protocolReserve: 11, rewardInventoryBucket: 28, escrow: 0, unsettledRounds: 0 });
    expect(v.derived).toMatchObject({ safetyReserve: 152, availableBankroll: 852, maxRoundExposure: 213, maxStraightStake: 6, maxOutsideStake: 213, tableOpen: true, reason: null, isSolvent: true });
    expect(v.derived.collateralizationPct).toBeNull();
    expect(v.usdAtPeg.bankroll).toBeCloseTo(101.6, 6);
    expect(v.usdAtPeg.availableBankroll).toBeCloseTo(85.2, 6);
    expect(v.wei.bankroll).toBe("30492857142857142");
    expect(v.block).toEqual({ blockNumber: 80_320_255, l1BlockNumber: 26_122_222, timestamp: NOW });
    expect(v.config.depositSplitBps).toEqual({ payoutLiquidity: 7000, rewardInventory: 2000, protocolReserve: 800, platformFee: 200 });
  });

  it("lists rounds that still reserve capacity", () => {
    const open = openRound({ betCount: 2, totalStaked: 30n, reservedUnits: 70n });
    const w = treasuryView(treasury({ reservedUnits: 70n }), game(), [open, round109], head);
    expect(w.snapshot.unsettledRounds).toBe(1);
    expect(w.snapshot.reservedLiability).toBe(70);
    expect(w.inFlightRounds).toEqual([{ roundId: 300, tableId: "1", status: "Open", betCount: 2, totalStaked: 30, reservedUnits: 70, pctOfCap: 32.86 }]);
  });

  it("explains why no bet can be accepted", () => {
    expect(tableClosedReason(treasury({ pause: { treasury: 0, game: 2, vault: 0 } }), game())).toBe("paused");
    expect(tableClosedReason(treasury({ availableUnits: 10n }), game())).toBe("insufficient-bankroll");
    expect(tableClosedReason(treasury(), game({ maxOutsideUnits: 0n }))).toBe("exposure-cap");
    const paused = treasuryView(treasury({ pause: { treasury: 2, game: 0, vault: 0 } }), game(), [], head);
    expect(paused.derived).toMatchObject({ tableOpen: false, reason: "paused" });
  });
});

describe("limitsView", () => {
  it("mirrors RiskEngine.maxSafeStake per multiplier in whole units", () => {
    const l = limitsView(treasury(), game(), 35, 0n, PAYOUT, head);
    expect(l).toMatchObject({ multiplier: 35, maxStake: 6, maxRoundExposure: 213, availableBankroll: 852, tableOpen: true, reason: null });
    expect(l.maxStakeByKind).toMatchObject({ straight: 6, split: 12, street: 19, corner: 26, sixline: 42, dozen: 106, column: 106, red: 213 });
    expect(limitsView(treasury(), game(), 35, 200n, PAYOUT, head)).toMatchObject({ maxStake: 0, tableOpen: false, reason: "exposure-cap" });
    expect(limitsView(treasury({ availableUnits: 10n }), game(), 1, 0n, PAYOUT, head)).toMatchObject({ maxStake: 0, reason: "insufficient-bankroll" });
  });
});

describe("tableView", () => {
  const base = { table: table1, treasury: treasury(), game: game(), recent: [28, 3], bettingSeconds: 45 };

  it("shows an idle table as waiting for players, not as an error", () => {
    const t = tableView({ ...base, latest: round109 });
    expect(t).toMatchObject({ id: "1", name: "Table 1", status: "live", visibility: "public", lockedReason: null, currentRound: null, operator: "waiting-for-players" });
    expect(t.limits).toEqual({ minBet: 1, maxBet: 500, maxOutside: 213, maxStraight: 6, treasuryMaxOutside: 213, treasuryMaxStraight: 6 });
    expect(t.lastRound).toEqual({ id: 109, status: "Settled", result: 28, openedAt: 1_790_996_040 });
    expect(t.recent).toEqual([28, 3]);
    expect(tableView({ ...base, latest: null })).toMatchObject({ currentRound: null, lastRound: null, operator: "waiting-for-players" });
  });

  it("describes an open round with an approximate close time", () => {
    const t = tableView({ ...base, latest: openRound({ betCount: 1, totalStaked: 5n, reservedUnits: 5n }), treasury: treasury({ escrowUnits: 45n }) });
    expect(t.operator).toBe("round-open");
    expect(t.currentRound).toEqual({
      id: 300,
      status: "Open",
      acceptingBets: true,
      openedAt: NOW - 10,
      betCount: 1,
      totalStaked: 5,
      reservedUnits: 5,
      betsCloseAt: NOW + 35,
      betsCloseAtApproximate: true,
      bettingWindowSeconds: 45,
      timesOutAt: NOW - 10 + 86_400,
    });
    expect(t.lastRound).toBeNull();
  });

  it("distinguishes a closed round and the gap between rounds while players are seated", () => {
    const closed = tableView({ ...base, latest: openRound({ status: ROUND_STATUS.Closed }) });
    expect(closed.operator).toBe("awaiting-reveal");
    expect(closed.currentRound).toMatchObject({ status: "Closed", acceptingBets: false, betsCloseAt: null });
    expect(tableView({ ...base, latest: round109, treasury: treasury({ escrowUnits: 50n }) }).operator).toBe("between-rounds");
  });

  it("locks a table that cannot take a bet and says why", () => {
    expect(tableView({ ...base, latest: null, table: { ...table1, active: false } })).toMatchObject({ status: "locked", lockedReason: "Table is not active on chain." });
    const paused = tableView({ ...base, latest: null, treasury: treasury({ pause: { treasury: 0, game: 2, vault: 0 } }) });
    expect(paused).toMatchObject({ status: "locked", lockedReason: "Gameplay is paused on chain." });
    expect(paused.limits).toMatchObject({ maxOutside: 0, maxStraight: 0 });
    // Treasury backs less than the table maximum: the effective cap is the smaller one.
    expect(tableView({ ...base, latest: null, table: { ...table1, maxStake: 100n } }).limits).toMatchObject({ maxBet: 100, maxOutside: 100, maxStraight: 6 });
  });
});

describe("roundView", () => {
  it("maps mainnet round 109 and verifies it from the revealed seeds", () => {
    const v = roundView(round109, 26_000_000n);
    expect(v).toMatchObject({
      roundId: 109,
      tableId: "1",
      status: "Settled",
      randomnessStatus: "Revealed",
      result: 28,
      color: "black",
      parity: "even",
      dozen: 3,
      column: 1,
      half: "high",
      betCount: 1,
      totalStaked: 5,
      totalReturned: 0,
      committedAtBlock: 26_108_945,
      revealAfterBlock: 26_108_952,
      settledAtBlock: 26_000_000,
      verified: true,
    });
    // Independent of the view: the same seeds reproduce the commitment and the result.
    const rm = round109.randomness!;
    expect(commit(rm.serverSeed)).toBe(rm.commitment);
    expect(deriveResult(rm.serverSeed, rm.playerSeed, rm.blockRef, 109n)).toBe(28);
    expect(verifyBody(v)).toEqual({ roundId: 109, commitment: rm.commitment, serverSeed: rm.serverSeed, playerSeed: rm.playerSeed, blockRef: rm.blockRef, result: 28 });
  });

  it("flags a round whose seeds do not reproduce the result", () => {
    const tampered = roundView({ ...round109, randomness: { ...round109.randomness!, result: 29 }, result: 29 });
    expect(tampered.verified).toBe(false);
    const mismatch = roundView({ ...round109, result: 5 });
    expect(mismatch.verified).toBe(false);
  });

  it("reveals nothing early: seeds and result are null while a round is open", () => {
    const v = roundView(openRound());
    expect(v).toMatchObject({ status: "Open", randomnessStatus: "Committed", result: null, color: null, playerSeed: null, serverSeed: null, blockRef: null, verified: null });
    expect(v.commitment).toBe(`0x${"ab".repeat(32)}`);
    expect(verifyBody(v)).toBeNull();
  });

  it("describes stored bets by their stable id", () => {
    expect(betView(round109Bets[0]!, 0)).toMatchObject({ index: 0, player: PLAYER, betId: "red", label: "Red", multiplier: 1, stake: 5, numbersMaskHex: "0x000000154aad52aa" });
    expect(betView({ player: PLAYER, numbersMask: 0b111n, multiplier: 99, stake: 1n }, 1)).toMatchObject({ betId: null, label: null, numbers: [0, 1, 2] });
  });
});

describe("betIdFromContract", () => {
  it("round-trips every bet kind", () => {
    for (const id of ["red", "black", "odd", "even", "low", "high", "dozen:2", "column:3", "straight:0", "straight:36", "split:17-20", "split:0-2", "street:4", "corner:25", "sixline:31"]) {
      const b = encodeBetById(id, 1);
      expect(betIdFromContract(b.numbersMask, b.multiplier), id).toBe(id);
    }
  });
  it("returns null for a mask/multiplier pair the app cannot name", () => {
    expect(betIdFromContract(MASK_RED, 2)).toBeNull();
    expect(betIdFromContract(0n, 35)).toBeNull();
    expect(betIdFromContract((1n << 1n) | (1n << 9n), 17)).toBeNull();
  });
});

describe("statsView", () => {
  const logs = [
    { roundId: 112n, result: 0, totalStaked: 4n, totalReturned: 0n, blockNumber: 3n },
    { roundId: 111n, result: 28, totalStaked: 5n, totalReturned: 0n, blockNumber: 2n },
    { roundId: 110n, result: 3, totalStaked: 10n, totalReturned: 20n, blockNumber: 1n },
  ];
  const opts = { table: null, window: 100, chipUsdValue: 10n ** 17n, scan: { fromBlock: 0n, toBlock: 60_000n } };

  it("counts only what was settled on chain inside the window", () => {
    const s = statsView(logs, opts);
    expect(s).toMatchObject({ sampled: 3, roundsSettled: 3, totalStaked: 19, totalReturned: 20, latest: [0, 28, 3] });
    expect(s.color).toEqual({ red: 1, black: 1, green: 1 });
    expect(s.parity).toEqual({ odd: 1, even: 1, zero: 1 });
    expect(s.pockets[28]).toBe(1);
    expect(s.usdAtPeg.totalStaked).toBeCloseTo(1.9, 6);
    expect(s.blockWindow).toMatchObject({ blocks: 60_000, approxMinutes: 100 });
    expect(s).not.toHaveProperty("players");
  });
  it("is honestly empty when nothing settled, and respects the requested window", () => {
    expect(statsView([], opts)).toMatchObject({ sampled: 0, totalStaked: 0, latest: [] });
    expect(statsView(logs, { ...opts, window: 1 })).toMatchObject({ sampled: 1, latest: [0] });
  });
});

describe("rewardsView / pricesView", () => {
  const assets = [asset(CASHCAT), asset(PONS, { oraclePriceUsd1e18: 398_201_000_000_000_000n, oracleUpdatedAt: NOW - 2_000, vault: { priceUsd1e18: undefined } })];

  it("reports the vault's real status: registered, zero inventory, UNAVAILABLE", () => {
    const r = rewardsView(assets, NOW);
    const cashcat = r.assets.find((a) => a.symbol === "CASHCAT")!;
    expect(cashcat).toMatchObject({ id: "crypto-cashcat", contractAddress: CASHCAT, registered: true, enabled: true, status: "unavailable", vaultStatus: "UNAVAILABLE", inventory: "0", inventoryTokens: 0, priceUsd: 0.16388, inventoryUsd: 0, minimumPayoutUsd: 0.5, oracle: ADDR.priceOracle, priceAgeSeconds: 369, maxStalenessSeconds: 900, priceStale: false });
    expect(r.totalInventoryUsd).toBe(0);
    // A stale price: nothing a claim could use, but the last post and its age are still shown.
    const pons = r.assets.find((a) => a.symbol === "PONS")!;
    expect(pons).toMatchObject({ priceUsd: null, postedPriceUsd: 0.398201, priceAgeSeconds: 2000, priceStale: true });
    // Registry entries the vault does not hold are listed as not listed, never with invented inventory.
    expect(r.assets.find((a) => a.symbol === "NVDA")).toMatchObject({ registered: false, status: "unverified", vaultStatus: null, inventory: null, priceUsd: null });
  });

  it("values funded inventory at the fresh price and shows assets the registry does not name", () => {
    const unknown = "0x00000000000000000000000000000000000000aa" as const;
    const r = rewardsView([asset(CASHCAT, { vault: { status: 2, inventory: 250n * 10n ** 18n } }), asset(unknown, { vault: { status: 1, inventory: 10n ** 18n } })], NOW);
    expect(r.assets.find((a) => a.symbol === "CASHCAT")).toMatchObject({ status: "available", vaultStatus: "AVAILABLE", inventoryTokens: 250, inventoryUsd: 40.97 });
    expect(r.assets.find((a) => a.contractAddress === unknown)).toMatchObject({ id: `onchain-${unknown}`, symbol: null, status: "low", vaultStatus: "LOW" });
    expect(r.totalInventoryUsd).toBeCloseTo(40.97 + 0.16, 2);
  });

  it("lists posted oracle prices with age and a staleness flag, on-chain source only", () => {
    const p = pricesView(assets, NOW);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ id: "crypto-cashcat", symbol: "CASHCAT", priceUsd: 0.16388, updatedAt: NOW - 369, ageSeconds: 369, stale: false, source: "onchain-oracle", oracle: ADDR.priceOracle });
    expect(p[1]).toMatchObject({ symbol: "PONS", stale: true, ageSeconds: 2000 });
    expect(pricesView([asset(CASHCAT, { oraclePriceUsd1e18: null, oracleUpdatedAt: null })], NOW)[0]).toMatchObject({ priceUsd: null, updatedAt: null, stale: true });
    expect(pricesView([asset(CASHCAT, { vault: { registered: false } })], NOW)).toHaveLength(0);
  });
});

describe("accountView", () => {
  it("summarises the caller's on-chain balances", () => {
    expect(accountView(account({ escrowUnits: 45n, winBalanceUsd1e18: 15n * 10n ** 17n }))).toEqual({
      address: PLAYER,
      walletChipUnits: 50,
      walletChips: { "1": 0, "5": 0, "10": 0, "25": 0, "50": 1, "100": 0 },
      escrowUnits: 45,
      chipsApproved: true,
      winBalanceUsd: 1.5,
      withdrawableWei: "0",
    });
  });
});
