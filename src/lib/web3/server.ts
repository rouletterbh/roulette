import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  createPublicClient,
  getAbiItem,
  hexToBigInt,
  http,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { activeChain } from "@/config/chains";
import { rewardRegistry } from "@/config/tokens";
import {
  CHIP_IDS,
  ROUND_SCAN_BLOCKS,
  ROUND_STATUS,
  balancesFromBatch,
  casinoTreasuryAbi,
  chip1155Abi,
  chipUnits,
  contractAddresses,
  postedPriceOracleAbi,
  randomnessManagerAbi,
  rewardVaultAbi,
  rouletteGameAbi,
  type ChainRoundStatus,
  type ChipBalances,
  type ContractKey,
} from "./contracts";
import type { ChainRoundRecord, ChainTableRecord, SettledRoundRecord, TreasuryRaw, VaultAssetRaw } from "./treasury-view";
import { LogWindow, TtlCache } from "./ttl-cache";

/**
 * Server-only chain reader for the public REST API (/api/v1) and anything else that
 * runs on the server. One viem public client (JSON-RPC over HTTP, eth_call batched
 * through Multicall3 where the chain has it), typed read functions, and a small
 * in-memory TTL cache in front so public traffic cannot hammer the RPC.
 *
 * Never import this from a "use client" module. It holds no key and sends nothing:
 * every method is a read. Route logic depends on the `ChainReader` interface, so tests
 * inject a fake instead of a network.
 */

/* ------------------------------------------------------------------ types */

export interface ChainHead {
  /** L2 block number (what eth_getLogs ranges use). */
  blockNumber: bigint;
  /** Ethereum L1 block number the contracts see as `block.number`; null when the RPC does not report it. */
  l1BlockNumber: bigint | null;
  /** Block timestamp, unix seconds. */
  timestamp: number;
}

export interface TreasuryState {
  raw: TreasuryRaw;
  /** `availableBankrollUnits()`: what the risk engine is given (chip units). */
  availableUnits: bigint;
  /** Units reserved for in-flight rounds. */
  reservedUnits: bigint;
  /** Chip units players hold in table escrow. Zero means nobody is seated. */
  escrowUnits: bigint;
  split: { payoutLiquidityBps: number; rewardInventoryBps: number; protocolReserveBps: number; platformFeeBps: number } | null;
  /** EmergencyPause bit flags per contract (see PAUSE_FLAGS); null when that contract is not configured. */
  pause: { treasury: number; game: number | null; vault: number | null };
}

export interface GameConfig {
  tableCount: number;
  roundTimeout: number;
  minBankrollToOpenUnits: bigint;
  maxBetsPerRound: number;
  /** `maxStakeFor(35)` / `maxStakeFor(1)`: treasury-backed stake caps on an empty round. */
  maxStraightUnits: bigint;
  maxOutsideUnits: bigint;
}

export interface RandomnessRecord {
  commitment: Hex;
  playerSeed: Hex;
  serverSeed: Hex;
  blockRef: Hex;
  /** L1 block numbers. */
  revealAfterBlock: bigint;
  committedAtBlock: bigint;
  result: number;
  status: number;
}

export interface ChainRoundFull extends ChainRoundRecord {
  /** Running player-entropy hash on RouletteGame (frozen into the randomness record at close). */
  gamePlayerSeed: Hex;
  /** RandomnessManager record; null when that contract is not configured. */
  randomness: RandomnessRecord | null;
}

export interface ChainBet {
  player: Address;
  numbersMask: bigint;
  multiplier: number;
  stake: bigint;
}

export interface LatestRounds {
  /** Newest round of every table that opened a round inside the scan window. */
  rounds: ChainRoundRecord[];
  /** Newest RoundOpened log in the window (any table). */
  lastOpened: { roundId: bigint; tableId: number; blockNumber: bigint } | null;
  window: { fromBlock: bigint; toBlock: bigint };
}

export interface RewardAssetState {
  address: Address;
  vault: VaultAssetRaw;
  oracle: Address | null;
  maxStalenessSeconds: number;
  lowWatermark: bigint;
  /** Raw PostedPriceOracle.getPrice (no staleness applied); null when never posted or unreadable. */
  oraclePriceUsd1e18: bigint | null;
  oracleUpdatedAt: number | null;
}

export interface VaultTotals {
  totalWinBalanceUsd1e18: bigint;
  totalCreditedUsd1e18: bigint;
  totalClaimedUsd1e18: bigint;
}

export interface AccountState {
  address: Address;
  chips: ChipBalances;
  chipUnits: number;
  /** Chip1155.isApprovedForAll(address, treasury). */
  approved: boolean;
  escrowUnits: bigint;
  /** RewardVault.winBalance (USD 1e18); 0 when the vault is not configured. */
  winBalanceUsd1e18: bigint;
  withdrawableWei: bigint;
}

export interface ChainReader {
  readonly chainId: number;
  readonly addresses: Readonly<Record<ContractKey, Address | null>>;
  /** L2 blocks scanned for RoundOpened (the latest round per table). */
  readonly scanBlocks: bigint;
  /** L2 blocks scanned for RoundSettled (round history and stats). */
  readonly historyScanBlocks: bigint;
  head(): Promise<ChainHead>;
  treasury(): Promise<TreasuryState>;
  game(): Promise<GameConfig>;
  tables(): Promise<ChainTableRecord[]>;
  latestRounds(): Promise<LatestRounds>;
  /** null when the round does not exist (status None). */
  round(roundId: bigint): Promise<ChainRoundFull | null>;
  /** Existing rounds among `ids`, in the order given. */
  rounds(ids: readonly bigint[]): Promise<ChainRoundFull[]>;
  bets(roundId: bigint): Promise<ChainBet[]>;
  settledRounds(): Promise<{ logs: SettledRoundRecord[]; window: { fromBlock: bigint; toBlock: bigint } }>;
  rewardAssets(): Promise<RewardAssetState[]>;
  vaultTotals(): Promise<VaultTotals>;
  /** RewardVault.quote; null when it reverts (unregistered, zero or stale price). */
  quoteClaim(asset: Address, usd1e18: bigint): Promise<{ amountOut: bigint; price: bigint } | null>;
  account(address: Address): Promise<AccountState>;
}

/** A contract the read needs has no `NEXT_PUBLIC_*_ADDRESS`. Routes answer CONTRACTS_NOT_DEPLOYED. */
export class ContractNotConfiguredError extends Error {
  constructor(public readonly contract: ContractKey) {
    super(`Contract address for "${contract}" is not configured in this environment`);
    this.name = "ContractNotConfiguredError";
  }
}

/* ------------------------------------------------------------------ cache */

/** Cache lifetimes (ms). Hot reads follow the chain within a few seconds; history is slower. */
export const CHAIN_CACHE_TTL = {
  head: 3_000,
  hot: 4_000,
  account: 3_000,
  /** RoundOpened window: tail-extended every call, so it can stay hot. */
  openedLogs: 4_000,
  /** RoundSettled window (history / stats). */
  settledLogs: 30_000,
  /** Table structs and game config change only by operator transactions. */
  config: 30_000,
} as const;

const FINAL_ROUNDS_MAX = 2_000;

/* ----------------------------------------------------------------- client */

export function createChainClient(rpcUrl?: string): PublicClient {
  const url = rpcUrl ?? process.env.CHAIN_RPC_URL ?? activeChain.rpcUrls.default.http[0];
  return createPublicClient({
    chain: activeChain,
    transport: http(url, { timeout: 10_000, retryCount: 2 }),
    batch: { multicall: { wait: 8 } },
  }) as PublicClient;
}

/** True when a read failed because the contract reverted (as opposed to the RPC being unreachable). */
function isRevert(e: unknown): boolean {
  return e instanceof BaseError && !!e.walk((x) => x instanceof ContractFunctionRevertedError || x instanceof ContractFunctionZeroDataError);
}

/** Resolves to `undefined` when the call reverts; RPC failures still reject. */
function orUndefinedOnRevert<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch((e: unknown) => {
    if (isRevert(e)) return undefined;
    throw e;
  });
}

/**
 * Optional server-side override for how far back round history and stats look
 * (`CHAIN_HISTORY_SCAN_BLOCKS`, L2 blocks). Defaults to the same window as the UI
 * (`NEXT_PUBLIC_ROUND_SCAN_BLOCKS`); the window actually used is reported in every response.
 */
function historyScanFromEnv(): bigint | null {
  const v = process.env.CHAIN_HISTORY_SCAN_BLOCKS;
  return v && /^[1-9]\d{0,8}$/.test(v) ? BigInt(v) : null;
}

const roundOpenedEvent = getAbiItem({ abi: rouletteGameAbi, name: "RoundOpened" });
const roundSettledEvent = getAbiItem({ abi: rouletteGameAbi, name: "RoundSettled" });
const ONE_USD = 10n ** 18n;

interface OpenedLog {
  roundId: bigint;
  tableId: number;
  blockNumber: bigint;
}

export interface ChainReaderOptions {
  client?: PublicClient;
  addresses?: Readonly<Record<ContractKey, Address | null>>;
  scanBlocks?: bigint;
  historyScanBlocks?: bigint;
  cache?: TtlCache;
}

export function createChainReader(opts: ChainReaderOptions = {}): ChainReader {
  let clientInstance = opts.client ?? null;
  const client = () => (clientInstance ??= createChainClient());
  const addresses = opts.addresses ?? contractAddresses;
  const scanBlocks = opts.scanBlocks ?? ROUND_SCAN_BLOCKS;
  const historyScanBlocks = opts.historyScanBlocks ?? historyScanFromEnv() ?? scanBlocks;
  const cache = opts.cache ?? new TtlCache();
  const finalRounds = new Map<string, ChainRoundFull>();
  const latestByTable = new Map<number, bigint>();

  const need = (key: ContractKey): Address => {
    const a = addresses[key];
    if (!a) throw new ContractNotConfiguredError(key);
    return a;
  };

  const head = () =>
    cache.get("head", CHAIN_CACHE_TTL.head, async (): Promise<ChainHead> => {
      const b = await client().getBlock({ blockTag: "latest" });
      const l1 = (b as unknown as { l1BlockNumber?: Hex | bigint | number }).l1BlockNumber;
      return {
        blockNumber: b.number ?? 0n,
        l1BlockNumber: l1 == null ? null : typeof l1 === "string" ? hexToBigInt(l1) : BigInt(l1),
        timestamp: Number(b.timestamp),
      };
    });

  const openedWindow = new LogWindow<OpenedLog>(async (fromBlock, toBlock) => {
    const logs = await client().getLogs({ address: need("game"), event: roundOpenedEvent, fromBlock, toBlock });
    return logs.flatMap((l) => (l.args.roundId != null && l.args.tableId != null && l.blockNumber != null ? [{ roundId: l.args.roundId, tableId: l.args.tableId, blockNumber: l.blockNumber }] : []));
  }, scanBlocks);

  const settledWindow = new LogWindow<SettledRoundRecord>(async (fromBlock, toBlock) => {
    const logs = await client().getLogs({ address: need("game"), event: roundSettledEvent, fromBlock, toBlock });
    return logs.flatMap((l) =>
      l.args.roundId != null && l.blockNumber != null
        ? [{ roundId: l.args.roundId, result: l.args.result ?? 0, totalStaked: l.args.totalStaked ?? 0n, totalReturned: l.args.totalReturned ?? 0n, blockNumber: l.blockNumber }]
        : [],
    );
  }, historyScanBlocks);

  const treasury = () =>
    cache.get("treasury", CHAIN_CACHE_TTL.hot, async (): Promise<TreasuryState> => {
      const address = need("treasury");
      const c = client();
      const t = { abi: casinoTreasuryAbi, address } as const;
      const [bankrollWei, reservedWei, claimableWei, protocolReserveWei, safetyReserveWei, availableWei, rewardInventoryWei, chipPriceWei, chipUsdValue, safetyReserveBps, maxRoundExposureBps, isSolvent, availableUnits, reservedUnits, escrowUnits, split, pauseT, pauseG, pauseV] =
        await Promise.all([
          c.readContract({ ...t, functionName: "bankroll" }),
          c.readContract({ ...t, functionName: "reservedLiability" }),
          c.readContract({ ...t, functionName: "claimable" }),
          c.readContract({ ...t, functionName: "protocolReserve" }),
          c.readContract({ ...t, functionName: "safetyReserve" }),
          c.readContract({ ...t, functionName: "availableBankroll" }),
          c.readContract({ ...t, functionName: "rewardInventory" }),
          c.readContract({ ...t, functionName: "chipPriceWei" }),
          c.readContract({ ...t, functionName: "chipUsdValue" }),
          c.readContract({ ...t, functionName: "safetyReserveBps" }),
          c.readContract({ ...t, functionName: "maxRoundExposureBps" }),
          c.readContract({ ...t, functionName: "isSolvent" }),
          c.readContract({ ...t, functionName: "availableBankrollUnits" }),
          c.readContract({ ...t, functionName: "reservedUnits" }),
          c.readContract({ ...t, functionName: "escrowUnits" }),
          c.readContract({ ...t, functionName: "splitConfig" }),
          c.readContract({ ...t, functionName: "pauseFlags" }),
          addresses.game ? c.readContract({ abi: rouletteGameAbi, address: addresses.game, functionName: "pauseFlags" }) : Promise.resolve(null),
          addresses.rewardVault ? c.readContract({ abi: rewardVaultAbi, address: addresses.rewardVault, functionName: "pauseFlags" }) : Promise.resolve(null),
        ]);
      return {
        raw: { bankrollWei, reservedWei, claimableWei, protocolReserveWei, safetyReserveWei, availableWei, rewardInventoryWei, chipPriceWei, chipUsdValue, safetyReserveBps, maxRoundExposureBps, isSolvent },
        availableUnits,
        reservedUnits,
        escrowUnits,
        split: { payoutLiquidityBps: split[0], rewardInventoryBps: split[1], protocolReserveBps: split[2], platformFeeBps: split[3] },
        pause: { treasury: pauseT, game: pauseG, vault: pauseV },
      };
    });

  const game = () =>
    cache.get("game", CHAIN_CACHE_TTL.hot, async (): Promise<GameConfig> => {
      const c = client();
      const g = { abi: rouletteGameAbi, address: need("game") } as const;
      const [tableCount, roundTimeout, minBankrollToOpenUnits, maxBetsPerRound, maxStraightUnits, maxOutsideUnits] = await Promise.all([
        c.readContract({ ...g, functionName: "tableCount" }),
        c.readContract({ ...g, functionName: "roundTimeout" }),
        c.readContract({ ...g, functionName: "minBankrollToOpenUnits" }),
        c.readContract({ ...g, functionName: "maxBetsPerRound" }),
        c.readContract({ ...g, functionName: "maxStakeFor", args: [35] }),
        c.readContract({ ...g, functionName: "maxStakeFor", args: [1] }),
      ]);
      return { tableCount, roundTimeout: Number(roundTimeout), minBankrollToOpenUnits, maxBetsPerRound: Number(maxBetsPerRound), maxStraightUnits, maxOutsideUnits };
    });

  const tables = () =>
    cache.get("tables", CHAIN_CACHE_TTL.config, async (): Promise<ChainTableRecord[]> => {
      const c = client();
      const address = need("game");
      const count = await c.readContract({ abi: rouletteGameAbi, address, functionName: "tableCount" });
      const ids = Array.from({ length: count }, (_, i) => i + 1);
      const rows = await Promise.all(ids.map((id) => c.readContract({ abi: rouletteGameAbi, address, functionName: "tables", args: [id] })));
      return rows.map(([minStake, maxStake, isPrivate, active], i) => ({ id: ids[i]!, minStake, maxStake, isPrivate, active }));
    });

  const isFinal = (r: ChainRoundFull) =>
    r.status === ROUND_STATUS.Voided || (r.status === ROUND_STATUS.Settled && (r.randomness == null || r.randomness.status === 3 /* Revealed */));

  async function loadRound(roundId: bigint): Promise<ChainRoundFull | null> {
    const key = roundId.toString();
    const done = finalRounds.get(key);
    if (done) return done;
    const c = client();
    const [g, rm] = await Promise.all([
      c.readContract({ abi: rouletteGameAbi, address: need("game"), functionName: "getRound", args: [roundId] }),
      addresses.randomness ? c.readContract({ abi: randomnessManagerAbi, address: addresses.randomness, functionName: "getRound", args: [roundId] }) : Promise.resolve(null),
    ]);
    if (g.status === ROUND_STATUS.None) return null;
    const full: ChainRoundFull = {
      tableId: g.tableId,
      roundId,
      status: g.status as ChainRoundStatus,
      result: g.result,
      openedAt: Number(g.openedAt),
      betCount: g.betCount,
      totalStaked: g.totalStaked,
      totalReturned: g.totalReturned,
      reservedUnits: g.reservedUnits,
      gamePlayerSeed: g.playerSeed,
      randomness: rm
        ? { commitment: rm.commitment, playerSeed: rm.playerSeed, serverSeed: rm.serverSeed, blockRef: rm.blockRef, revealAfterBlock: rm.revealAfterBlock, committedAtBlock: rm.committedAtBlock, result: rm.result, status: rm.status }
        : null,
    };
    if (isFinal(full)) {
      if (finalRounds.size >= FINAL_ROUNDS_MAX) finalRounds.delete(finalRounds.keys().next().value as string);
      finalRounds.set(key, full);
    }
    return full;
  }

  const round = (roundId: bigint) => cache.get(`round:${roundId}`, CHAIN_CACHE_TTL.hot, () => loadRound(roundId));

  const rounds = async (ids: readonly bigint[]) => (await Promise.all(ids.map((id) => round(id)))).filter((r): r is ChainRoundFull => r != null);

  const latestRounds = () =>
    cache.get("latestRounds", CHAIN_CACHE_TTL.openedLogs, async (): Promise<LatestRounds> => {
      const h = await head();
      const w = await openedWindow.refresh(h.blockNumber);
      for (const l of w.items) {
        const cur = latestByTable.get(l.tableId);
        if (cur == null || l.roundId > cur) latestByTable.set(l.tableId, l.roundId);
      }
      const newest = w.items.length ? w.items[w.items.length - 1]! : null;
      const full = await rounds([...latestByTable.values()]);
      return { rounds: full, lastOpened: newest, window: { fromBlock: w.fromBlock, toBlock: w.toBlock } };
    });

  const settledRounds = () =>
    cache.get("settledRounds", CHAIN_CACHE_TTL.settledLogs, async () => {
      const h = await head();
      const w = await settledWindow.refresh(h.blockNumber);
      return { logs: [...w.items], window: { fromBlock: w.fromBlock, toBlock: w.toBlock } };
    });

  const bets = (roundId: bigint) =>
    cache.get(`bets:${roundId}`, CHAIN_CACHE_TTL.hot, async (): Promise<ChainBet[]> => {
      const rows = await client().readContract({ abi: rouletteGameAbi, address: need("game"), functionName: "getBets", args: [roundId] });
      return rows.map((b) => ({ player: b.player, numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake }));
    });

  const rewardAssets = () =>
    cache.get("rewardAssets", CHAIN_CACHE_TTL.hot, async (): Promise<RewardAssetState[]> => {
      const c = client();
      const vault = { abi: rewardVaultAbi, address: need("rewardVault") } as const;
      const onChain = await c.readContract({ ...vault, functionName: "assets" });
      // The vault's own list first, then registry tokens it does not (yet) know about.
      const seen = new Set<string>();
      const list: Address[] = [];
      for (const a of [...onChain, ...rewardRegistry.flatMap((t) => (t.contractAddress ? [t.contractAddress as Address] : []))]) {
        if (seen.has(a.toLowerCase())) continue;
        seen.add(a.toLowerCase());
        list.push(a);
      }
      const first = await Promise.all(
        list.map((asset) =>
          Promise.all([
            c.readContract({ ...vault, functionName: "assetConfig", args: [asset] }),
            c.readContract({ ...vault, functionName: "status", args: [asset] }),
            c.readContract({ ...vault, functionName: "inventory", args: [asset] }),
            orUndefinedOnRevert(c.readContract({ ...vault, functionName: "quote", args: [asset, ONE_USD] })),
          ]),
        ),
      );
      const prices = await Promise.all(
        first.map(([cfg], i) => (cfg.oracle !== zeroAddress ? orUndefinedOnRevert(c.readContract({ abi: postedPriceOracleAbi, address: cfg.oracle, functionName: "getPrice", args: [list[i]!] })) : Promise.resolve(undefined))),
      );
      return list.map((address, i) => {
        const [cfg, status, inventory, quote] = first[i]!;
        const registered = cfg.oracle !== zeroAddress;
        const price = prices[i];
        return {
          address,
          vault: { registered, enabled: cfg.enabled, decimals: registered ? cfg.decimals : 18, status, inventory, minimumPayoutUsd: cfg.minimumPayoutUsd, priceUsd1e18: quote?.[1] },
          oracle: registered ? cfg.oracle : null,
          maxStalenessSeconds: cfg.maxStaleness,
          lowWatermark: cfg.lowWatermark,
          oraclePriceUsd1e18: price && price[0] > 0n ? price[0] : null,
          oracleUpdatedAt: price && price[1] > 0n ? Number(price[1]) : null,
        };
      });
    });

  const vaultTotals = () =>
    cache.get("vaultTotals", CHAIN_CACHE_TTL.hot, async (): Promise<VaultTotals> => {
      const c = client();
      const vault = { abi: rewardVaultAbi, address: need("rewardVault") } as const;
      const [totalWinBalanceUsd1e18, totalCreditedUsd1e18, totalClaimedUsd1e18] = await Promise.all([
        c.readContract({ ...vault, functionName: "totalWinBalance" }),
        c.readContract({ ...vault, functionName: "totalCreditedUsd" }),
        c.readContract({ ...vault, functionName: "totalClaimedUsd" }),
      ]);
      return { totalWinBalanceUsd1e18, totalCreditedUsd1e18, totalClaimedUsd1e18 };
    });

  const quoteClaim = (asset: Address, usd1e18: bigint) =>
    cache.get(`quote:${asset.toLowerCase()}:${usd1e18}`, CHAIN_CACHE_TTL.hot, async () => {
      const q = await orUndefinedOnRevert(client().readContract({ abi: rewardVaultAbi, address: need("rewardVault"), functionName: "quote", args: [asset, usd1e18] }));
      return q ? { amountOut: q[0], price: q[1] } : null;
    });

  const account = (address: Address) =>
    cache.get(`account:${address.toLowerCase()}`, CHAIN_CACHE_TTL.account, async (): Promise<AccountState> => {
      const c = client();
      const chip = need("chip");
      const treasuryAddress = need("treasury");
      const [batch, approved, escrowUnits, winBalanceUsd1e18, withdrawableWei] = await Promise.all([
        c.readContract({ abi: chip1155Abi, address: chip, functionName: "balanceOfBatch", args: [CHIP_IDS.map(() => address), [...CHIP_IDS]] }),
        c.readContract({ abi: chip1155Abi, address: chip, functionName: "isApprovedForAll", args: [address, treasuryAddress] }),
        c.readContract({ abi: rouletteGameAbi, address: need("game"), functionName: "escrow", args: [address] }),
        addresses.rewardVault ? c.readContract({ abi: rewardVaultAbi, address: addresses.rewardVault, functionName: "winBalance", args: [address] }) : Promise.resolve(0n),
        c.readContract({ abi: casinoTreasuryAbi, address: treasuryAddress, functionName: "withdrawable", args: [address] }),
      ]);
      const chips = balancesFromBatch(batch);
      return { address, chips, chipUnits: chipUnits(chips), approved, escrowUnits, winBalanceUsd1e18, withdrawableWei };
    });

  return { chainId: activeChain.id, addresses, scanBlocks, historyScanBlocks, head, treasury, game, tables, latestRounds, round, rounds, bets, settledRounds, rewardAssets, vaultTotals, quoteClaim, account };
}

/* -------------------------------------------------------------- singleton */

const GLOBAL_KEY = "__robletteChainReader";

/** Process-wide reader (one client, one cache), kept on globalThis so dev reloads do not multiply clients. */
export function getChainReader(): ChainReader {
  const g = globalThis as unknown as Record<string, ChainReader | undefined>;
  return (g[GLOBAL_KEY] ??= createChainReader());
}
