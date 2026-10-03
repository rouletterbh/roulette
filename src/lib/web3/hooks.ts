"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient, useReadContract, useReadContracts, useWatchContractEvent } from "wagmi";
import { getAbiItem, zeroAddress, type Address } from "viem";
import { siteConfig } from "@/config/site";
import { activeChain } from "@/config/chains";
import { rewardRegistry } from "@/config/tokens";
import type { TreasurySnapshot } from "@/lib/risk/engine";
import {
  CHAIN_POLL_MS,
  CHIP_IDS,
  ROUND_SCAN_BLOCKS,
  ROUND_STATUS,
  balancesFromBatch,
  casinoTreasuryAbi,
  chip1155Abi,
  chipUnits,
  contractAddresses,
  emptyChipBalances,
  randomnessManagerAbi,
  rewardVaultAbi,
  rouletteGameAbi,
  type ChainRoundStatus,
} from "./contracts";
import type { ChainRoundView, RandomnessRoundView } from "./round-sync";
import type { ChainRoundRecord, ChainTableRecord, SettledRoundRecord, TreasuryRaw, VaultAssetRaw } from "./treasury-view";

/**
 * Read hooks for live chain state. Every hook is a no-op (disabled query) in demo
 * mode and when the relevant address is not configured, so callers can render
 * unconditionally inside the WagmiProvider. Polling is a modest 4s.
 */
const LIVE = !siteConfig.demoMode;
const chainId = activeChain.id;
const poll = (enabled: boolean) => ({ enabled, refetchInterval: enabled ? CHAIN_POLL_MS : false, staleTime: 1000 } as const);

/* ----------------------------------------------------------------- chips */

export function useChipBalances(address?: Address | null) {
  const chip = contractAddresses.chip;
  const enabled = LIVE && !!chip && !!address;
  const owner = address ?? zeroAddress;
  const q = useReadContract({
    abi: chip1155Abi,
    address: chip ?? zeroAddress,
    functionName: "balanceOfBatch",
    args: [CHIP_IDS.map(() => owner), [...CHIP_IDS]],
    chainId,
    query: poll(enabled),
  });
  const balances = useMemo(() => (q.data ? balancesFromBatch(q.data) : emptyChipBalances()), [q.data]);
  return { balances, units: chipUnits(balances), isLoading: enabled && q.isLoading, error: q.error, refetch: q.refetch, enabled };
}

export function useChipApproval(owner?: Address | null) {
  const { chip, treasury } = contractAddresses;
  const enabled = LIVE && !!chip && !!treasury && !!owner;
  const q = useReadContract({
    abi: chip1155Abi,
    address: chip ?? zeroAddress,
    functionName: "isApprovedForAll",
    args: [owner ?? zeroAddress, treasury ?? zeroAddress],
    chainId,
    query: { enabled, staleTime: 10_000 },
  });
  return { approved: q.data ?? false, isLoading: enabled && q.isLoading, refetch: q.refetch };
}

/* ---------------------------------------------------------------- escrow */

export function useEscrow(address?: Address | null) {
  const game = contractAddresses.game;
  const enabled = LIVE && !!game && !!address;
  const q = useReadContract({ abi: rouletteGameAbi, address: game ?? zeroAddress, functionName: "escrow", args: [address ?? zeroAddress], chainId, query: poll(enabled) });
  return { escrow: q.data ?? 0n, units: Number(q.data ?? 0n), isLoading: enabled && q.isLoading, isFetched: q.isFetched, error: q.error, refetch: q.refetch, enabled };
}

/* ---------------------------------------------------------------- rounds */

export interface CurrentRound extends ChainRoundView {
  tableId: number;
  betCount: number;
  totalStaked: bigint;
  totalReturned: bigint;
  /** Operator-driven: there is no fixed close time on chain. */
  closesAt?: number;
  /** True once the initial log scan finished (even if it found nothing). */
  scanned: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const roundOpenedEvent = getAbiItem({ abi: rouletteGameAbi, name: "RoundOpened" });

/**
 * Latest round opened for `tableId`: an initial scan of the last ~5000 blocks for
 * RoundOpened, then RoundOpened/RoundClosed/RoundSettled/RoundVoided watchers. The
 * status itself is always read from `getRound` (polled) so a missed log self-heals.
 */
export function useCurrentRound(tableId: number): CurrentRound {
  const game = contractAddresses.game;
  const client = usePublicClient({ chainId });
  const enabled = LIVE && !!game;
  const [roundId, setRoundId] = useState<bigint | null>(null);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !client || !game) return;
    let cancelled = false;
    (async () => {
      const latest = await client.getBlockNumber();
      const scan = async (span: bigint) =>
        client.getLogs({ address: game, event: roundOpenedEvent, args: { tableId }, fromBlock: latest > span ? latest - span : 0n, toBlock: latest });
      let logs;
      try {
        logs = await scan(ROUND_SCAN_BLOCKS);
      } catch {
        logs = await scan(ROUND_SCAN_BLOCKS / 5n); // RPCs with a tighter getLogs range
      }
      if (cancelled) return;
      const last = logs.length ? logs[logs.length - 1] : null;
      const id = last?.args.roundId;
      if (id != null) setRoundId((prev) => (prev == null || id > prev ? id : prev));
      setScanned(true);
    })().catch((e: unknown) => {
      if (cancelled) return;
      setScanError(e instanceof Error ? e : new Error(String(e)));
      setScanned(true);
    });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, game, tableId]);

  useWatchContractEvent({
    abi: rouletteGameAbi,
    address: game ?? zeroAddress,
    eventName: "RoundOpened",
    args: { tableId },
    chainId,
    enabled,
    pollingInterval: CHAIN_POLL_MS,
    onLogs: (logs) => {
      for (const l of logs) {
        const id = l.args.roundId;
        if (id != null) setRoundId((prev) => (prev == null || id > prev ? id : prev));
      }
    },
  });

  const round = useReadContract({
    abi: rouletteGameAbi,
    address: game ?? zeroAddress,
    functionName: "getRound",
    args: [roundId ?? 0n],
    chainId,
    query: poll(enabled && roundId != null),
  });
  const roundRefetch = round.refetch;
  const refetch = useCallback(() => {
    void roundRefetch();
  }, [roundRefetch]);

  const onRoundLog = useCallback(
    (logs: ReadonlyArray<{ args: { roundId?: bigint } }>) => {
      if (roundId != null && logs.some((l) => l.args.roundId === roundId)) refetch();
    },
    [refetch, roundId],
  );
  useWatchContractEvent({ abi: rouletteGameAbi, address: game ?? zeroAddress, eventName: "RoundClosed", chainId, enabled: enabled && roundId != null, pollingInterval: CHAIN_POLL_MS, onLogs: onRoundLog });
  useWatchContractEvent({ abi: rouletteGameAbi, address: game ?? zeroAddress, eventName: "RoundSettled", chainId, enabled: enabled && roundId != null, pollingInterval: CHAIN_POLL_MS, onLogs: onRoundLog });
  useWatchContractEvent({ abi: rouletteGameAbi, address: game ?? zeroAddress, eventName: "RoundVoided", chainId, enabled: enabled && roundId != null, pollingInterval: CHAIN_POLL_MS, onLogs: onRoundLog });

  const d = round.data;
  const status = (d?.status ?? ROUND_STATUS.None) as ChainRoundStatus;
  return {
    roundId: roundId != null && (!d || status !== ROUND_STATUS.None) ? roundId : null,
    tableId,
    status,
    result: d && status === ROUND_STATUS.Settled ? d.result : null,
    openedAt: Number(d?.openedAt ?? 0n),
    betCount: d?.betCount ?? 0,
    totalStaked: d?.totalStaked ?? 0n,
    totalReturned: d?.totalReturned ?? 0n,
    scanned,
    isLoading: enabled && (!scanned || (roundId != null && round.isLoading)),
    error: scanError ?? (round.error as Error | null),
    refetch,
  };
}

/** RandomnessManager round record for a chain round (commitment, seeds, result). */
export function useRandomnessRound(roundId: bigint | null): { round: RandomnessRoundView | null; refetch: () => void } {
  const rm = contractAddresses.randomness;
  const enabled = LIVE && !!rm && roundId != null;
  const q = useReadContract({ abi: randomnessManagerAbi, address: rm ?? zeroAddress, functionName: "getRound", args: [roundId ?? 0n], chainId, query: poll(enabled) });
  const round = useMemo<RandomnessRoundView | null>(() => {
    const d = q.data;
    if (!d) return null;
    return { commitment: d.commitment, playerSeed: d.playerSeed, serverSeed: d.serverSeed, blockRef: d.blockRef, result: d.result, status: d.status };
  }, [q.data]);
  const qRefetch = q.refetch;
  const refetch = useCallback(() => {
    void qRefetch();
  }, [qRefetch]);
  return { round, refetch };
}

/** The player's bets stored on chain for a round (to rebuild the slip after a reload). */
export function useChainBets(roundId: bigint | null, player?: Address | null) {
  const game = contractAddresses.game;
  const enabled = LIVE && !!game && roundId != null && !!player;
  const q = useReadContract({ abi: rouletteGameAbi, address: game ?? zeroAddress, functionName: "getBets", args: [roundId ?? 0n], chainId, query: poll(enabled) });
  const mine = useMemo(() => (q.data && player ? q.data.filter((b) => b.player.toLowerCase() === player.toLowerCase()) : []), [q.data, player]);
  return { bets: mine, refetch: q.refetch };
}

/* -------------------------------------------------------------- treasury */

export interface TreasuryChainSnapshot {
  /** Risk-engine snapshot in chip units (the store's unit), derived from wei at chipPriceWei. */
  snapshot: TreasurySnapshot | null;
  availableBankrollWei: bigint;
  availableBankrollUnits: bigint;
  bankrollWei: bigint;
  chipPriceWei: bigint;
  /** USD per chip unit, 1e18 fixed. */
  chipUsdValue: bigint;
  isSolvent: boolean;
  /** Deposit split, bps. */
  split: { payoutLiquidityBps: number; rewardInventoryBps: number; protocolReserveBps: number; platformFeeBps: number } | null;
  pauseFlags: number;
  /** Raw wei buckets for the treasury page (see treasury-view.ts). */
  raw: TreasuryRaw;
  isLoading: boolean;
  isFetched: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTreasurySnapshot(): TreasuryChainSnapshot {
  const t = contractAddresses.treasury;
  const g = contractAddresses.game;
  const enabled = LIVE && !!t;
  const addr = t ?? zeroAddress;
  const q = useReadContracts({
    contracts: [
      { abi: casinoTreasuryAbi, address: addr, functionName: "bankroll", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "reservedLiability", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "claimable", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "protocolReserve", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "safetyReserveBps", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "maxRoundExposureBps", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "chipPriceWei", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "chipUsdValue", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "availableBankroll", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "availableBankrollUnits", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "isSolvent", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "splitConfig", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "pauseFlags", chainId },
      { abi: rouletteGameAbi, address: g ?? addr, functionName: "pauseFlags", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "safetyReserve", chainId },
      { abi: casinoTreasuryAbi, address: addr, functionName: "rewardInventory", chainId },
    ],
    allowFailure: true,
    query: poll(enabled),
  });
  const qRefetch = q.refetch;
  const refetch = useCallback(() => {
    void qRefetch();
  }, [qRefetch]);
  return useMemo(() => {
    const r = q.data;
    const val = <T,>(i: number): T | undefined => (r?.[i]?.status === "success" ? (r[i].result as T) : undefined);
    const bankrollWei = val<bigint>(0) ?? 0n;
    const reserved = val<bigint>(1) ?? 0n;
    const claimable = val<bigint>(2) ?? 0n;
    const reserve = val<bigint>(3) ?? 0n;
    const safetyBps = val<number>(4) ?? 1500;
    const exposureBps = val<number>(5) ?? 2500;
    const chipPriceWei = val<bigint>(6) ?? 0n;
    const chipUsdValue = val<bigint>(7) ?? 0n;
    const availableBankrollWei = val<bigint>(8) ?? 0n;
    const availableBankrollUnits = val<bigint>(9) ?? 0n;
    const isSolvent = val<boolean>(10) ?? false;
    const splitRaw = val<readonly [number, number, number, number]>(11);
    const pauseT = val<number>(12) ?? 0;
    const pauseG = val<number>(13) ?? 0;
    const safetyReserveWei = val<bigint>(14) ?? 0n;
    const rewardInventoryWei = val<bigint>(15) ?? 0n;
    const units = (wei: bigint) => (chipPriceWei > 0n ? Number(wei / chipPriceWei) : 0);
    const snapshot: TreasurySnapshot | null =
      r && chipPriceWei > 0n
        ? { bankroll: units(bankrollWei), reservedLiability: units(reserved), claimableRewards: units(claimable), protocolReserve: units(reserve), safetyReserveBps: safetyBps, maxRoundExposureBps: exposureBps }
        : null;
    return {
      snapshot,
      availableBankrollWei,
      availableBankrollUnits,
      bankrollWei,
      chipPriceWei,
      chipUsdValue,
      isSolvent,
      split: splitRaw ? { payoutLiquidityBps: splitRaw[0], rewardInventoryBps: splitRaw[1], protocolReserveBps: splitRaw[2], platformFeeBps: splitRaw[3] } : null,
      pauseFlags: pauseT | pauseG,
      raw: {
        bankrollWei,
        reservedWei: reserved,
        claimableWei: claimable,
        protocolReserveWei: reserve,
        safetyReserveWei,
        availableWei: availableBankrollWei,
        rewardInventoryWei,
        chipPriceWei,
        chipUsdValue,
        safetyReserveBps: safetyBps,
        maxRoundExposureBps: exposureBps,
        isSolvent,
      },
      isLoading: enabled && q.isLoading,
      isFetched: q.isFetched,
      error: (q.error as Error | null) ?? null,
      refetch,
    };
  }, [q.data, q.isLoading, q.isFetched, q.error, enabled, refetch]);
}

/** Pull-payment credit waiting in the treasury for `address`. */
export function useWithdrawable(address?: Address | null) {
  const t = contractAddresses.treasury;
  const enabled = LIVE && !!t && !!address;
  const q = useReadContract({ abi: casinoTreasuryAbi, address: t ?? zeroAddress, functionName: "withdrawable", args: [address ?? zeroAddress], chainId, query: poll(enabled) });
  return { wei: q.data ?? 0n, refetch: q.refetch };
}

/* --------------------------------------------------------------- rewards */

export type RewardAssetStatus = "unavailable" | "low" | "available";
const ASSET_STATUS: RewardAssetStatus[] = ["unavailable", "low", "available"];

export function useWinBalance(address?: Address | null) {
  const v = contractAddresses.rewardVault;
  const enabled = LIVE && !!v && !!address;
  const q = useReadContract({ abi: rewardVaultAbi, address: v ?? zeroAddress, functionName: "winBalance", args: [address ?? zeroAddress], chainId, query: poll(enabled) });
  return { usd1e18: q.data ?? 0n, usd: Number(q.data ?? 0n) / 1e18, refetch: q.refetch, isFetched: q.isFetched };
}

const ONE_USD = 10n ** 18n;

/** Vault status for a reward asset: config, inventory, liquidity tier and the live oracle quote for $1. */
export function useRewardStatus(asset?: Address | null) {
  const v = contractAddresses.rewardVault;
  const enabled = LIVE && !!v && !!asset;
  const addr = v ?? zeroAddress;
  const a = asset ?? zeroAddress;
  const q = useReadContracts({
    contracts: [
      { abi: rewardVaultAbi, address: addr, functionName: "assetConfig", args: [a], chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "status", args: [a], chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "inventory", args: [a], chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "quote", args: [a, ONE_USD], chainId },
    ],
    allowFailure: true,
    query: poll(enabled),
  });
  return useMemo(() => {
    const r = q.data;
    const cfg = r?.[0]?.status === "success" ? r[0].result : undefined;
    const st = r?.[1]?.status === "success" ? (r[1].result as number) : undefined;
    const inv = r?.[2]?.status === "success" ? (r[2].result as bigint) : 0n;
    const quote = r?.[3]?.status === "success" ? (r[3].result as readonly [bigint, bigint]) : undefined;
    const decimals = cfg?.decimals ?? 18;
    const priceUsd = quote ? Number(quote[1]) / 1e18 : null;
    return {
      registered: !!cfg && cfg.oracle !== zeroAddress,
      enabled: cfg?.enabled ?? false,
      decimals,
      minimumPayoutUsd: cfg ? Number(cfg.minimumPayoutUsd) / 1e18 : 0,
      status: st != null ? ASSET_STATUS[st] ?? "unavailable" : ("unavailable" as RewardAssetStatus),
      inventory: inv,
      inventoryUnits: Number(inv) / 10 ** decimals,
      /** Oracle USD price (null when stale/unset). */
      priceUsd,
      quoteStale: !!cfg && !quote,
      isLoading: enabled && q.isLoading,
      refetch: q.refetch,
    };
  }, [q.data, q.isLoading, q.refetch, enabled]);
}

/* ------------------------------------------------- treasury / tables pages */

/**
 * Every chain table (tableCount → tables(1..n)) plus the risk figures the Tables page
 * derives limits from. One polled multicall for the scalars, one for the table structs.
 */
export function useChainTables() {
  const game = contractAddresses.game;
  const enabled = LIVE && !!game;
  const addr = game ?? zeroAddress;
  const head = useReadContracts({
    contracts: [
      { abi: rouletteGameAbi, address: addr, functionName: "tableCount", chainId },
      { abi: rouletteGameAbi, address: addr, functionName: "maxStakeFor", args: [35], chainId },
      { abi: rouletteGameAbi, address: addr, functionName: "roundTimeout", chainId },
      { abi: rouletteGameAbi, address: addr, functionName: "minBankrollToOpenUnits", chainId },
    ],
    allowFailure: true,
    query: poll(enabled),
  });
  const h = head.data;
  const count = h?.[0]?.status === "success" ? Number(h[0].result) : 0;
  const ids = useMemo(() => Array.from({ length: count }, (_, i) => i + 1), [count]);
  const rows = useReadContracts({
    contracts: ids.map((id) => ({ abi: rouletteGameAbi, address: addr, functionName: "tables" as const, args: [id] as const, chainId })),
    allowFailure: true,
    query: poll(enabled && count > 0),
  });
  const tables = useMemo<ChainTableRecord[]>(() => {
    const r = rows.data;
    if (!r) return [];
    return ids.flatMap((id, i) => {
      const item = r[i];
      if (!item || item.status !== "success") return [];
      const [minStake, maxStake, isPrivate, active] = item.result as readonly [bigint, bigint, boolean, boolean];
      return [{ id, minStake, maxStake, isPrivate, active }];
    });
  }, [rows.data, ids]);
  return {
    enabled,
    count,
    tables,
    maxStraightUnits: h?.[1]?.status === "success" ? Number(h[1].result) : 0,
    roundTimeout: h?.[2]?.status === "success" ? Number(h[2].result) : 0,
    minBankrollToOpenUnits: h?.[3]?.status === "success" ? Number(h[3].result) : 0,
    isLoading: enabled && (head.isLoading || (count > 0 && rows.isLoading)),
    isFetched: head.isFetched && (count === 0 || rows.isFetched),
    error: (head.error as Error | null) ?? (rows.error as Error | null) ?? null,
  };
}

/**
 * Latest round of every table: one RoundOpened scan over the last ROUND_SCAN_BLOCKS
 * (no table filter), a RoundOpened watcher, then polled `getRound` for each id so
 * status/bets/reserved units stay current. Rounds older than the scan window are
 * not shown (there is no on-chain index of "current round per table").
 */
export function useLatestRounds() {
  const game = contractAddresses.game;
  const client = usePublicClient({ chainId });
  const enabled = LIVE && !!game;
  const [latest, setLatest] = useState<Record<number, bigint>>({});
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<Error | null>(null);

  const absorb = useCallback((logs: ReadonlyArray<{ args: { roundId?: bigint; tableId?: number } }>) => {
    setLatest((prev) => {
      let next: Record<number, bigint> | null = null;
      for (const l of logs) {
        const { roundId, tableId } = l.args;
        if (roundId == null || tableId == null) continue;
        const cur = (next ?? prev)[tableId];
        if (cur == null || roundId > cur) {
          next = next ?? { ...prev };
          next[tableId] = roundId;
        }
      }
      return next ?? prev;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !client || !game) return;
    let cancelled = false;
    (async () => {
      const head = await client.getBlockNumber();
      const scan = (span: bigint) => client.getLogs({ address: game, event: roundOpenedEvent, fromBlock: head > span ? head - span : 0n, toBlock: head });
      let logs;
      try {
        logs = await scan(ROUND_SCAN_BLOCKS);
      } catch {
        logs = await scan(ROUND_SCAN_BLOCKS / 5n);
      }
      if (cancelled) return;
      absorb(logs);
      setScanned(true);
    })().catch((e: unknown) => {
      if (cancelled) return;
      setScanError(e instanceof Error ? e : new Error(String(e)));
      setScanned(true);
    });
    return () => {
      cancelled = true;
    };
  }, [absorb, client, enabled, game]);

  useWatchContractEvent({ abi: rouletteGameAbi, address: game ?? zeroAddress, eventName: "RoundOpened", chainId, enabled, pollingInterval: CHAIN_POLL_MS, onLogs: absorb });

  const entries = useMemo(() => Object.entries(latest).map(([t, id]) => ({ tableId: Number(t), roundId: id })).sort((a, b) => a.tableId - b.tableId), [latest]);
  const q = useReadContracts({
    contracts: entries.map((e) => ({ abi: rouletteGameAbi, address: game ?? zeroAddress, functionName: "getRound" as const, args: [e.roundId] as const, chainId })),
    allowFailure: true,
    query: poll(enabled && entries.length > 0),
  });
  const rounds = useMemo<ChainRoundRecord[]>(() => {
    const r = q.data;
    if (!r) return [];
    return entries.flatMap((e, i) => {
      const item = r[i];
      if (!item || item.status !== "success") return [];
      const d = item.result as { tableId: number; status: number; result: number; betCount: number; openedAt: bigint; totalStaked: bigint; totalReturned: bigint; reservedUnits: bigint };
      const status = d.status as ChainRoundStatus;
      if (status === ROUND_STATUS.None) return [];
      return [{ tableId: e.tableId, roundId: e.roundId, status, result: d.result, openedAt: Number(d.openedAt), betCount: d.betCount, totalStaked: d.totalStaked, totalReturned: d.totalReturned, reservedUnits: d.reservedUnits }];
    });
  }, [q.data, entries]);
  return { enabled, rounds, scanned, isLoading: enabled && (!scanned || (entries.length > 0 && q.isLoading)), error: scanError ?? (q.error as Error | null) ?? null };
}

/** Vault-wide totals: win balances owed to players and lifetime credited / claimed USD (1e18). */
export function useVaultTotals() {
  const v = contractAddresses.rewardVault;
  const enabled = LIVE && !!v;
  const addr = v ?? zeroAddress;
  const q = useReadContracts({
    contracts: [
      { abi: rewardVaultAbi, address: addr, functionName: "totalWinBalance", chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "totalCreditedUsd", chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "totalClaimedUsd", chainId },
    ],
    allowFailure: true,
    query: poll(enabled),
  });
  const val = (i: number) => (q.data?.[i]?.status === "success" ? (q.data[i].result as bigint) : undefined);
  return { enabled, totalWinBalanceUsd1e18: val(0), totalCreditedUsd1e18: val(1), totalClaimedUsd1e18: val(2), isFetched: q.isFetched };
}

const REGISTERED_ASSETS = rewardRegistry.flatMap((t) => (t.contractAddress ? [t.contractAddress as Address] : []));

/** Vault config, status, inventory and $1 quote for every registry token with a contract address, keyed by lowercase address. */
export function useRewardInventoryAll() {
  const v = contractAddresses.rewardVault;
  const enabled = LIVE && !!v && REGISTERED_ASSETS.length > 0;
  const addr = v ?? zeroAddress;
  const q = useReadContracts({
    contracts: REGISTERED_ASSETS.flatMap((a) => [
      { abi: rewardVaultAbi, address: addr, functionName: "assetConfig" as const, args: [a] as const, chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "status" as const, args: [a] as const, chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "inventory" as const, args: [a] as const, chainId },
      { abi: rewardVaultAbi, address: addr, functionName: "quote" as const, args: [a, ONE_USD] as const, chainId },
    ]),
    allowFailure: true,
    query: poll(enabled),
  });
  const byAddress = useMemo(() => {
    const m = new Map<string, VaultAssetRaw>();
    const r = q.data;
    if (!r) return m;
    REGISTERED_ASSETS.forEach((a, i) => {
      const at = <T,>(k: number): T | undefined => (r[i * 4 + k]?.status === "success" ? (r[i * 4 + k].result as T) : undefined);
      const cfg = at<{ enabled: boolean; decimals: number; oracle: Address; minimumPayoutUsd: bigint }>(0);
      const quote = at<readonly [bigint, bigint]>(3);
      m.set(a.toLowerCase(), {
        registered: !!cfg && cfg.oracle !== zeroAddress,
        enabled: cfg?.enabled ?? false,
        decimals: cfg?.decimals ?? 18,
        status: at<number>(1),
        inventory: at<bigint>(2) ?? 0n,
        minimumPayoutUsd: cfg?.minimumPayoutUsd ?? 0n,
        priceUsd1e18: quote?.[1],
      });
    });
    return m;
  }, [q.data]);
  return { enabled, byAddress, isFetched: q.isFetched, isLoading: enabled && q.isLoading };
}

const roundSettledEvent = getAbiItem({ abi: rouletteGameAbi, name: "RoundSettled" });

/**
 * RoundSettled events (result, totalStaked, totalReturned in chip units) over the last
 * ROUND_SCAN_BLOCKS blocks, kept current by a watcher. This is the only on-chain
 * source for wager/payout history; the window is reported so the UI can say so.
 */
export function useSettledRounds() {
  const game = contractAddresses.game;
  const client = usePublicClient({ chainId });
  const enabled = LIVE && !!game;
  const [logs, setLogs] = useState<SettledRoundRecord[]>([]);
  const [window, setWindow] = useState<{ fromBlock: bigint; toBlock: bigint } | null>(null);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const absorb = useCallback((items: ReadonlyArray<{ args: { roundId?: bigint; result?: number; totalStaked?: bigint; totalReturned?: bigint }; blockNumber: bigint | null }>) => {
    setLogs((prev) => {
      const seen = new Set(prev.map((l) => l.roundId));
      const add: SettledRoundRecord[] = [];
      for (const l of items) {
        const { roundId, result, totalStaked, totalReturned } = l.args;
        if (roundId == null || seen.has(roundId)) continue;
        seen.add(roundId);
        add.push({ roundId, result: result ?? 0, totalStaked: totalStaked ?? 0n, totalReturned: totalReturned ?? 0n, blockNumber: l.blockNumber ?? 0n });
      }
      return add.length ? [...prev, ...add] : prev;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !client || !game) return;
    let cancelled = false;
    (async () => {
      const head = await client.getBlockNumber();
      const scan = async (span: bigint) => {
        const fromBlock = head > span ? head - span : 0n;
        const items = await client.getLogs({ address: game, event: roundSettledEvent, fromBlock, toBlock: head });
        return { items, fromBlock };
      };
      let res;
      try {
        res = await scan(ROUND_SCAN_BLOCKS);
      } catch {
        res = await scan(ROUND_SCAN_BLOCKS / 5n);
      }
      if (cancelled) return;
      absorb(res.items);
      setWindow({ fromBlock: res.fromBlock, toBlock: head });
      setScanned(true);
    })().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setScanned(true);
    });
    return () => {
      cancelled = true;
    };
  }, [absorb, client, enabled, game]);

  useWatchContractEvent({ abi: rouletteGameAbi, address: game ?? zeroAddress, eventName: "RoundSettled", chainId, enabled, pollingInterval: CHAIN_POLL_MS, onLogs: absorb });

  return { enabled, logs, window, scanned, error };
}
