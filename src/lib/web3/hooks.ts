"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient, useReadContract, useReadContracts, useWatchContractEvent } from "wagmi";
import { getAbiItem, zeroAddress, type Address } from "viem";
import { siteConfig } from "@/config/site";
import { activeChain } from "@/config/chains";
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
  const refetch = useCallback(() => {
    void round.refetch();
  }, [round]);

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
  const refetch = useCallback(() => {
    void q.refetch();
  }, [q]);
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
    ],
    allowFailure: true,
    query: poll(enabled),
  });
  const refetch = useCallback(() => {
    void q.refetch();
  }, [q]);
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
