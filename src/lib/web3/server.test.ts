// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ContractFunctionRevertedError, type PublicClient } from "viem";
import { ADDR, CASHCAT, PLAYER } from "@/lib/agent/__fixtures__/chain";
import { ROUND_STATUS, rewardVaultAbi } from "./contracts";
import { ContractNotConfiguredError, createChainReader } from "./server";
import { TtlCache } from "./ttl-cache";

/**
 * The reader against a scripted viem client: which calls it makes, how it maps them,
 * and what the cache does. No network.
 */
const ZERO32 = `0x${"0".repeat(64)}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function script(over: { fail?: () => boolean; rounds?: Record<string, { status: number; result?: number; rm?: number }>; opened?: Array<[bigint, number, bigint]>; settled?: Array<[bigint, number, bigint]> } = {}) {
  const counts: Record<string, number> = {};
  const logRanges: Array<[string, bigint, bigint]> = [];
  let block = 1_000_000n;
  const views: Record<string, (args: readonly unknown[], address: string) => unknown> = {
    bankroll: () => 30_000_000_000_000_000n,
    reservedLiability: () => 0n,
    claimable: () => 0n,
    protocolReserve: () => 0n,
    safetyReserve: () => 4_500_000_000_000_000n,
    availableBankroll: () => 25_500_000_000_000_000n,
    rewardInventory: () => 0n,
    chipPriceWei: () => 30_000_000_000_000n,
    chipUsdValue: () => 10n ** 17n,
    safetyReserveBps: () => 1500,
    maxRoundExposureBps: () => 2500,
    isSolvent: () => true,
    availableBankrollUnits: () => 850n,
    reservedUnits: () => 0n,
    escrowUnits: () => 45n,
    splitConfig: () => [7000, 2000, 800, 200],
    pauseFlags: (_a, address) => (address === ADDR.game ? 2 : 0),
    tableCount: () => 2,
    tables: ([id]) => [1n, id === 1 ? 500n : 50n, id === 2, true],
    roundTimeout: () => 86_400n,
    minBankrollToOpenUnits: () => 25n,
    maxBetsPerRound: () => 256n,
    maxStakeFor: ([m]) => (m === 35 ? 6n : 212n),
    getRound: ([id], address) => {
      const r = over.rounds?.[String(id)];
      if (address === ADDR.randomness) return { commitment: ZERO32, playerSeed: ZERO32, serverSeed: ZERO32, blockRef: ZERO32, revealAfterBlock: 0n, committedAtBlock: 0n, result: r?.result ?? 0, status: r?.rm ?? 0 };
      return { tableId: 1, status: r?.status ?? 0, result: r?.result ?? 0, betCount: 0, openedAt: 1_700_000_000n, totalStaked: 0n, totalReturned: 0n, reservedUnits: 0n, playerSeed: ZERO32 };
    },
    getBets: () => [{ player: PLAYER, numbersMask: 2n, multiplier: 35, stake: 3n }],
    assets: () => [CASHCAT],
    assetConfig: ([a]) => (a === CASHCAT ? { enabled: true, decimals: 18, maxStaleness: 900, oracle: ADDR.priceOracle, minimumPayoutUsd: 5n * 10n ** 17n, lowWatermark: 0n } : { enabled: false, decimals: 0, maxStaleness: 0, oracle: ZERO_ADDR, minimumPayoutUsd: 0n, lowWatermark: 0n }),
    status: () => 0,
    inventory: () => 0n,
    quote: ([a, usd]) => (a === CASHCAT ? [(usd as bigint) * 10n, 10n ** 17n] : Promise.reject(new ContractFunctionRevertedError({ abi: rewardVaultAbi, functionName: "quote", message: "AssetNotRegistered" }))),
    getPrice: () => [10n ** 17n, 1_700_000_000n],
    totalWinBalance: () => 1n,
    totalCreditedUsd: () => 2n,
    totalClaimedUsd: () => 3n,
    balanceOfBatch: () => [0n, 0n, 0n, 0n, 1n, 0n],
    isApprovedForAll: () => true,
    escrow: () => 7n,
    winBalance: () => 10n ** 18n,
    withdrawable: () => 9n,
  };
  const client = {
    getBlock: async () => {
      counts.getBlock = (counts.getBlock ?? 0) + 1;
      if (over.fail?.()) throw new Error("rpc down");
      return { number: block, timestamp: 1_700_000_100n, l1BlockNumber: "0x18e97b7" };
    },
    getLogs: async ({ event, fromBlock, toBlock }: { event: { name: string }; fromBlock: bigint; toBlock: bigint }) => {
      counts[`getLogs:${event.name}`] = (counts[`getLogs:${event.name}`] ?? 0) + 1;
      logRanges.push([event.name, fromBlock, toBlock]);
      if (over.fail?.()) throw new Error("rpc down");
      const src = event.name === "RoundOpened" ? (over.opened ?? []) : (over.settled ?? []);
      return src
        .filter(([, , b]) => b >= fromBlock && b <= toBlock)
        .map(([roundId, n, blockNumber]) => ({ blockNumber, args: event.name === "RoundOpened" ? { roundId, tableId: n } : { roundId, result: n, totalStaked: 5n, totalReturned: 0n } }));
    },
    readContract: async ({ functionName, args, address }: { functionName: string; args?: readonly unknown[]; address: string }) => {
      counts[functionName] = (counts[functionName] ?? 0) + 1;
      if (over.fail?.()) throw new Error("rpc down");
      const fn = views[functionName];
      if (!fn) throw new Error(`unscripted view ${functionName}`);
      return fn(args ?? [], address);
    },
  };
  return { client: client as unknown as PublicClient, counts, logRanges, mine: (n: bigint) => (block += n) };
}

const reader = (s: ReturnType<typeof script>, over: Partial<Parameters<typeof createChainReader>[0]> = {}) => createChainReader({ client: s.client, addresses: { ...ADDR }, scanBlocks: 60_000n, historyScanBlocks: 60_000n, ...over });

describe("server chain reader", () => {
  it("reads the head including the L1 block number the contracts see", async () => {
    expect(await reader(script()).head()).toEqual({ blockNumber: 1_000_000n, l1BlockNumber: 0x18e97b7n, timestamp: 1_700_000_100 });
  });

  it("maps the treasury snapshot, pause flags per contract and total escrow", async () => {
    const t = await reader(script()).treasury();
    expect(t.raw).toMatchObject({ bankrollWei: 30_000_000_000_000_000n, chipPriceWei: 30_000_000_000_000n, chipUsdValue: 10n ** 17n, safetyReserveBps: 1500, maxRoundExposureBps: 2500, isSolvent: true });
    expect(t).toMatchObject({ availableUnits: 850n, escrowUnits: 45n, pause: { treasury: 0, game: 2, vault: 0 } });
    expect(t.split).toEqual({ payoutLiquidityBps: 7000, rewardInventoryBps: 2000, protocolReserveBps: 800, platformFeeBps: 200 });
  });

  it("reads every table and the treasury-backed stake caps", async () => {
    const r = reader(script());
    expect(await r.tables()).toEqual([
      { id: 1, minStake: 1n, maxStake: 500n, isPrivate: false, active: true },
      { id: 2, minStake: 1n, maxStake: 50n, isPrivate: true, active: true },
    ]);
    expect(await r.game()).toEqual({ tableCount: 2, roundTimeout: 86_400, minBankrollToOpenUnits: 25n, maxBetsPerRound: 256, maxStraightUnits: 6n, maxOutsideUnits: 212n });
  });

  it("serves hot reads from cache inside the TTL and reloads after it", async () => {
    let now = 0;
    const s = script();
    const r = reader(s, { cache: new TtlCache(() => now) });
    await r.treasury();
    await r.treasury();
    expect(s.counts.bankroll).toBe(1);
    now += 4_001;
    await r.treasury();
    expect(s.counts.bankroll).toBe(2);
  });

  it("never caches a failed read", async () => {
    let fail = true;
    const s = script({ fail: () => fail });
    const r = reader(s);
    await expect(r.treasury()).rejects.toThrow("rpc down");
    fail = false;
    expect((await r.treasury()).availableUnits).toBe(850n);
  });

  it("throws ContractNotConfiguredError instead of guessing an address", async () => {
    const r = reader(script(), { addresses: { ...ADDR, game: null, rewardVault: null } });
    await expect(r.tables()).rejects.toBeInstanceOf(ContractNotConfiguredError);
    await expect(r.rewardAssets()).rejects.toMatchObject({ contract: "rewardVault" });
    // The treasury is still readable; pause flags of the missing contracts are null.
    expect((await r.treasury()).pause).toEqual({ treasury: 0, game: null, vault: null });
  });

  it("finds the latest round per table from RoundOpened logs, then reads its state", async () => {
    let now = 0;
    const s = script({ opened: [[244n, 1, 990_000n], [245n, 1, 999_000n], [246n, 1, 1_000_050n]], rounds: { "245": { status: ROUND_STATUS.Open }, "246": { status: ROUND_STATUS.Open } } });
    const r = reader(s, { cache: new TtlCache(() => now) });
    const first = await r.latestRounds();
    expect(s.logRanges[0]).toEqual(["RoundOpened", 940_000n, 1_000_000n]);
    expect(first.rounds.map((x) => [x.roundId, x.status])).toEqual([[245n, ROUND_STATUS.Open]]);
    expect(first.lastOpened).toEqual({ roundId: 245n, tableId: 1, blockNumber: 999_000n });
    expect(first.window).toEqual({ fromBlock: 940_000n, toBlock: 1_000_000n });
    // New blocks: only the tail is scanned, and the newer round takes over.
    s.mine(100n);
    now += 5_000;
    const second = await r.latestRounds();
    expect(s.logRanges[1]).toEqual(["RoundOpened", 1_000_001n, 1_000_100n]);
    expect(second.rounds.map((x) => x.roundId)).toEqual([246n]);
  });

  it("returns null for a round that does not exist and keeps final rounds without re-reading", async () => {
    let now = 0;
    const s = script({ rounds: { "109": { status: ROUND_STATUS.Settled, result: 28, rm: 3 }, "300": { status: ROUND_STATUS.Open, rm: 1 } } });
    const r = reader(s, { cache: new TtlCache(() => now) });
    expect(await r.round(5n)).toBeNull();
    expect(await r.round(109n)).toMatchObject({ roundId: 109n, status: ROUND_STATUS.Settled, result: 28, openedAt: 1_700_000_000, randomness: { status: 3, result: 28 } });
    await r.round(300n);
    const before = s.counts.getRound!;
    now += 60_000;
    await r.round(109n); // settled + revealed: immutable, served without a read
    expect(s.counts.getRound).toBe(before);
    await r.round(300n); // still open: read again
    expect(s.counts.getRound).toBe(before + 2);
    expect(await r.bets(109n)).toEqual([{ player: PLAYER, numbersMask: 2n, multiplier: 35, stake: 3n }]);
  });

  it("collects RoundSettled logs with the block window they cover", async () => {
    const s = script({ settled: [[109n, 28, 950_000n], [50n, 3, 100n]] });
    const { logs, window } = await reader(s).settledRounds();
    expect(logs).toEqual([{ roundId: 109n, result: 28, totalStaked: 5n, totalReturned: 0n, blockNumber: 950_000n }]);
    expect(window).toEqual({ fromBlock: 940_000n, toBlock: 1_000_000n });
  });

  it("reads vault assets with oracle price and age; a reverting quote becomes no price, not an error", async () => {
    const assets = await reader(script()).rewardAssets();
    const cashcat = assets.find((a) => a.address === CASHCAT)!;
    expect(cashcat).toMatchObject({ oracle: ADDR.priceOracle, maxStalenessSeconds: 900, oraclePriceUsd1e18: 10n ** 17n, oracleUpdatedAt: 1_700_000_000 });
    expect(cashcat.vault).toMatchObject({ registered: true, enabled: true, status: 0, inventory: 0n, priceUsd1e18: 10n ** 17n });
    // Registry tokens the vault does not know are reported as not registered.
    const other = assets.find((a) => a.address !== CASHCAT)!;
    expect(other.vault).toMatchObject({ registered: false, priceUsd1e18: undefined });
    expect(other.oracle).toBeNull();
  });

  it("reads an account's chips, approval, escrow and win balance", async () => {
    const a = await reader(script()).account(PLAYER);
    expect(a).toMatchObject({ address: PLAYER, chipUnits: 50, approved: true, escrowUnits: 7n, winBalanceUsd1e18: 10n ** 18n, withdrawableWei: 9n });
    expect(a.chips[50]).toBe(1n);
    expect(await reader(script()).vaultTotals()).toEqual({ totalWinBalanceUsd1e18: 1n, totalCreditedUsd1e18: 2n, totalClaimedUsd1e18: 3n });
    expect(await reader(script()).quoteClaim(CASHCAT, 10n ** 18n)).toEqual({ amountOut: 10n ** 19n, price: 10n ** 17n });
  });
});
