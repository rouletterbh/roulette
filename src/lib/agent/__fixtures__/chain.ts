import type { Address, Hex } from "viem";
import type { ContractKey } from "@/lib/web3/contracts";
import { ROUND_STATUS } from "@/lib/web3/contracts";
import type { AccountState, ChainBet, ChainHead, ChainReader, ChainRoundFull, GameConfig, LatestRounds, RewardAssetState, TreasuryState, VaultTotals, OperatorWallet } from "@/lib/web3/server";
import { ContractNotConfiguredError } from "@/lib/web3/server";
import type { ChainTableRecord, SettledRoundRecord } from "@/lib/web3/treasury-view";
import { MASK_RED } from "@/lib/agent/encode-bets";

/**
 * Test fixtures: a fake `ChainReader` seeded with the values Robinhood Chain mainnet
 * returned on 2026-10-05 (treasury after the first smoke test, table 1, round 109 with
 * its real seeds, the three registered reward assets with zero vault inventory).
 * No network; every method is an in-memory lookup that tests can override.
 */
export const ADDR = {
  treasury: "0xD376887C8103a8697A0009b6bb13e061C0b7e535",
  chip: "0xE68741905bDb68D67264409857a9C985Eaa0e2b2",
  game: "0x4d02F58D9e3e0CccaD49dB18ed0609661d61B94A",
  rewardVault: "0x83Ea24a4276fe47967F375bc8ca10F870c070A5B",
  randomness: "0xd57Fa0Bb23E43C1Ad872e82BB8D5c5D1A03C3e76",
  riskEngine: "0xfc9cC755cA4Dd7Bc2BBE31483aCbA65ffeA55086",
  priceOracle: "0x284C9eCF075D0fD48Fa83C7B8816644392a54E68",
  accessController: "0x42C6B7cd66Ad226CDd89cde0eC0D025DA9702911",
} as const satisfies Record<ContractKey, Address>;

export const PLAYER = "0x1c01912b96BA6783ae8c3c1D8e135Ee185079aa5" as Address;
export const CASHCAT = "0x020bfC650A365f8BB26819deAAbF3E21291018b4" as Address;
export const PONS = "0x39dBED3a2bd333467115dE45665cC57F813C4571" as Address;
export const NOW = 1_791_155_809;

export const CHIP_PRICE = 30_000_000_000_000n;
export const CHIP_USD = 10n ** 17n;

export const head: ChainHead = { blockNumber: 80_320_255n, l1BlockNumber: 26_122_222n, timestamp: NOW };

export const treasury = (over: Partial<TreasuryState> = {}): TreasuryState => ({
  raw: {
    bankrollWei: 30_492_857_142_857_142n,
    reservedWei: 0n,
    claimableWei: 0n,
    protocolReserveWei: 342_857_142_857_142n,
    safetyReserveWei: 4_573_928_571_428_571n,
    availableWei: 25_576_071_428_571_429n,
    rewardInventoryWei: 857_142_857_142_856n,
    chipPriceWei: CHIP_PRICE,
    chipUsdValue: CHIP_USD,
    safetyReserveBps: 1500,
    maxRoundExposureBps: 2500,
    isSolvent: true,
  },
  availableUnits: 852n,
  reservedUnits: 0n,
  escrowUnits: 0n,
  split: { payoutLiquidityBps: 7000, rewardInventoryBps: 2000, protocolReserveBps: 800, platformFeeBps: 200 },
  pause: { treasury: 0, game: 0, vault: 0 },
  ...over,
});

export const game = (over: Partial<GameConfig> = {}): GameConfig => ({ tableCount: 1, roundTimeout: 86_400, minBankrollToOpenUnits: 25n, maxBetsPerRound: 256, maxStraightUnits: 6n, maxOutsideUnits: 213n, ...over });

export const table1: ChainTableRecord = { id: 1, minStake: 1n, maxStake: 500n, isPrivate: false, active: true };

/** Round 109 on mainnet: 5 on Red, result 28 (black), settled; seeds as revealed on chain. */
export const round109: ChainRoundFull = {
  tableId: 1,
  roundId: 109n,
  status: ROUND_STATUS.Settled,
  result: 28,
  openedAt: 1_790_996_040,
  betCount: 1,
  totalStaked: 5n,
  totalReturned: 0n,
  reservedUnits: 0n,
  gamePlayerSeed: "0x204e406319ccc83f0146d1281914afe94070788bfe2fec3d4506a5a5e784303f",
  randomness: {
    commitment: "0x6ea6fc55d885afec1cfbc41d87f693c4e1c768a7ee09cf199efb9e25745ae45c",
    playerSeed: "0x204e406319ccc83f0146d1281914afe94070788bfe2fec3d4506a5a5e784303f",
    serverSeed: "0x91b701c33dc38befce7989e337e8e137e51575ea1d4bd25f1536df829d017b81",
    blockRef: "0x952b9c16e89f70b33bb13ad8d9f0de58f076733cef6ae08e311af44f092642de",
    revealAfterBlock: 26_108_952n,
    committedAtBlock: 26_108_945n,
    result: 28,
    status: 3,
  },
};
export const round109Bets: ChainBet[] = [{ player: PLAYER, numbersMask: MASK_RED, multiplier: 1, stake: 5n }];

const ZERO32 = `0x${"0".repeat(64)}` as Hex;

/** An Open round with a commitment and no bets yet. */
export const openRound = (over: Partial<ChainRoundFull> = {}): ChainRoundFull => ({
  tableId: 1,
  roundId: 300n,
  status: ROUND_STATUS.Open,
  result: 0,
  openedAt: NOW - 10,
  betCount: 0,
  totalStaked: 0n,
  totalReturned: 0n,
  reservedUnits: 0n,
  gamePlayerSeed: ZERO32,
  randomness: { commitment: `0x${"ab".repeat(32)}`, playerSeed: ZERO32, serverSeed: ZERO32, blockRef: ZERO32, revealAfterBlock: 0n, committedAtBlock: 26_122_200n, result: 0, status: 1 },
  ...over,
});

export const asset = (address: Address, over: Partial<Omit<RewardAssetState, "vault">> & { vault?: Partial<RewardAssetState["vault"]> } = {}): RewardAssetState => {
  const { vault, ...rest } = over;
  return {
    address,
    oracle: ADDR.priceOracle,
    maxStalenessSeconds: 900,
    lowWatermark: 10n ** 19n,
    oraclePriceUsd1e18: 163_880_000_000_000_000n,
    oracleUpdatedAt: NOW - 369,
    ...rest,
    // Mainnet today: registered and enabled, zero inventory → status 0 (UNAVAILABLE), fresh posted price.
    vault: { registered: true, enabled: true, decimals: 18, status: 0, inventory: 0n, minimumPayoutUsd: 5n * 10n ** 17n, priceUsd1e18: 163_880_000_000_000_000n, ...vault },
  };
};

export const account = (over: Partial<AccountState> = {}): AccountState => ({
  address: PLAYER,
  // One 50-chip in the wallet, nothing in escrow, treasury already approved (mainnet today).
  chips: { 1: 0n, 5: 0n, 10: 0n, 25: 0n, 50: 1n, 100: 0n },
  chipUnits: 50,
  approved: true,
  escrowUnits: 0n,
  winBalanceUsd1e18: 0n,
  withdrawableWei: 0n,
  ...over,
});

export interface FakeChain {
  head: ChainHead;
  treasury: TreasuryState;
  game: GameConfig;
  tables: ChainTableRecord[];
  /** Every round the fake chain knows, by id. */
  rounds: ChainRoundFull[];
  bets: Record<string, ChainBet[]>;
  /** Ids of rounds with a RoundOpened log inside the scan window. */
  opened: bigint[];
  /** RoundSettled logs inside the scan window. */
  settled: SettledRoundRecord[];
  assets: RewardAssetState[];
  totals: VaultTotals;
  account: AccountState;
  quote: { amountOut: bigint; price: bigint } | null;
  addresses: Record<ContractKey, Address | null>;
  /** Make every read reject, as an unreachable RPC would. */
  down: boolean;
  /** Operator gas wallet as /health would infer it; undefined = no recent activity visible. */
  operatorWallet?: OperatorWallet | null;
}

export function fakeChain(over: Partial<FakeChain> = {}): FakeChain {
  return {
    head,
    treasury: treasury(),
    game: game(),
    tables: [table1],
    rounds: [round109],
    bets: { "109": round109Bets },
    opened: [],
    settled: [],
    assets: [asset(CASHCAT), asset(PONS, { oraclePriceUsd1e18: 398_201_000_000_000_000n, vault: { priceUsd1e18: 398_201_000_000_000_000n } })],
    totals: { totalWinBalanceUsd1e18: 0n, totalCreditedUsd1e18: 0n, totalClaimedUsd1e18: 0n },
    account: account(),
    quote: null,
    addresses: { ...ADDR },
    down: false,
    ...over,
  };
}

/** A `ChainReader` over `state`. `calls` counts reads per method. */
export function fakeReader(state: FakeChain = fakeChain()): ChainReader & { calls: Record<string, number>; state: FakeChain } {
  const calls: Record<string, number> = {};
  const read = async <T,>(name: string, fn: () => T, needs: ContractKey[] = []): Promise<T> => {
    calls[name] = (calls[name] ?? 0) + 1;
    if (state.down) throw new Error("HTTP request failed: fetch failed");
    for (const k of needs) if (!state.addresses[k]) throw new ContractNotConfiguredError(k);
    return fn();
  };
  const window = { fromBlock: state.head.blockNumber - 60_000n, toBlock: state.head.blockNumber };
  const byId = (id: bigint) => state.rounds.find((r) => r.roundId === id) ?? null;
  return {
    calls,
    state,
    chainId: 4663,
    get addresses() {
      return state.addresses;
    },
    scanBlocks: 60_000n,
    historyScanBlocks: 60_000n,
    head: () => read("head", () => state.head),
    treasury: () => read("treasury", () => state.treasury, ["treasury"]),
    game: () => read("game", () => state.game, ["game"]),
    tables: () => read("tables", () => state.tables, ["game"]),
    latestRounds: () =>
      read(
        "latestRounds",
        (): LatestRounds => {
          const rounds = state.opened.map(byId).filter((r): r is ChainRoundFull => r != null);
          const newest = rounds.length ? rounds.reduce((a, b) => (b.roundId > a.roundId ? b : a)) : null;
          const perTable = new Map<number, ChainRoundFull>();
          for (const r of rounds) if (!perTable.has(r.tableId) || r.roundId > perTable.get(r.tableId)!.roundId) perTable.set(r.tableId, r);
          return { rounds: [...perTable.values()], lastOpened: newest ? { roundId: newest.roundId, tableId: newest.tableId, blockNumber: state.head.blockNumber - 100n } : null, window };
        },
        ["game"],
      ),
    operatorWallet: () => read("operatorWallet", () => state.operatorWallet ?? null),
    round: (id) => read("round", () => byId(id), ["game"]),
    rounds: (ids) => read("rounds", () => ids.map(byId).filter((r): r is ChainRoundFull => r != null), ["game"]),
    bets: (id) => read("bets", () => state.bets[id.toString()] ?? [], ["game"]),
    settledRounds: () => read("settledRounds", () => ({ logs: state.settled, window }), ["game"]),
    rewardAssets: () => read("rewardAssets", () => state.assets, ["rewardVault"]),
    vaultTotals: () => read("vaultTotals", () => state.totals, ["rewardVault"]),
    quoteClaim: () => read("quoteClaim", () => state.quote, ["rewardVault"]),
    account: (address) => read("account", () => ({ ...state.account, address }), ["chip", "treasury", "game"]),
  };
}
