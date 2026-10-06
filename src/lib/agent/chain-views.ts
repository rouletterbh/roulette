import { formatUnits, type Address, type Hex } from "viem";
import { rewardRegistry, type LiquidityStatus, type RewardToken } from "@/config/tokens";
import { colorOf, columnOf, dozenOf, type PocketColor } from "@/lib/roulette/constants";
import { betFromId } from "@/lib/roulette/bets";
import { PAUSE_FLAGS, RANDOMNESS_STATUS, ROUND_STATUS } from "@/lib/web3/contracts";
import { buildChainReveal } from "@/lib/web3/round-sync";
import {
  REWARD_STATUS_LABEL,
  buildLiabilityRows,
  buildRewardRows,
  buildTreasuryView,
  roundStatusLabel,
  tableName,
  unitsToUsd,
  type ChainRoundRecord,
  type ChainTableRecord,
  type SettledRoundRecord,
} from "@/lib/web3/treasury-view";
import type { AccountState, ChainBet, ChainHead, ChainRoundFull, GameConfig, RewardAssetState, TreasuryState } from "@/lib/web3/server";
import { maxRoundExposureUnits, maxSafeStakeUnits } from "@/lib/risk/units";
import { betIdFromContract, maskToHex, maskToNumbers } from "./encode-bets";

/**
 * Pure chain → JSON view models for the chain-backed /api/v1 routes. No I/O: the
 * handlers in ./chain-api.ts read through a `ChainReader` and pass the records in.
 * Amounts are chip units (integers) unless a field says otherwise; USD is derived only
 * from the treasury's chip peg (`chipUsdValue`) and labelled `usdAtPeg`, because there
 * is no ETH/USD price on chain.
 */

export const PEG_NOTE = "USD figures are peg-derived: chip units × CasinoTreasury.chipUsdValue (USD per chip unit, set by the protocol). There is no ETH/USD price on chain.";
export const PROOF_FORMULA = "result = keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ uint256(roundId)) mod 37; commitment = keccak256(serverSeed)";

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const ZERO32 = `0x${"0".repeat(64)}`;
const seedOrNull = (h: Hex | undefined | null): Hex | null => (h && h !== ZERO32 ? h : null);

/** JSON number while it is exact, decimal string beyond 2^53 (round ids are uint256). */
export function idJson(id: bigint): number | string {
  return id <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : id.toString();
}

/** Chip-unit amounts are small integers; fall back to a string rather than lose precision. */
const unitsJson = (u: bigint): number => Number(u);

export function pauseView(flags: number | null) {
  if (flags == null) return null;
  return {
    flags,
    deposits: (flags & PAUSE_FLAGS.deposits) !== 0,
    gameplay: (flags & PAUSE_FLAGS.gameplay) !== 0,
    claims: (flags & PAUSE_FLAGS.claims) !== 0,
    withdrawals: (flags & PAUSE_FLAGS.withdrawals) !== 0,
  };
}

export const gameplayPaused = (t: TreasuryState) => ((t.pause.treasury | (t.pause.game ?? 0)) & PAUSE_FLAGS.gameplay) !== 0;
export const claimsPaused = (t: TreasuryState) => ((t.pause.treasury | (t.pause.vault ?? 0)) & PAUSE_FLAGS.claims) !== 0;

export function headView(h: ChainHead) {
  return { blockNumber: idJson(h.blockNumber), l1BlockNumber: h.l1BlockNumber == null ? null : idJson(h.l1BlockNumber), timestamp: h.timestamp };
}

/* -------------------------------------------------------------- treasury */

export type TableClosedReason = "paused" | "insufficient-bankroll" | "exposure-cap" | null;

/** Why no bet can be accepted right now, mirroring openRound / maxStakeFor on chain. */
export function tableClosedReason(t: TreasuryState, g: GameConfig): TableClosedReason {
  if (gameplayPaused(t)) return "paused";
  if (t.availableUnits < g.minBankrollToOpenUnits) return "insufficient-bankroll";
  if (g.maxOutsideUnits <= 0n) return "exposure-cap";
  return null;
}

export function treasuryView(t: TreasuryState, g: GameConfig, latest: readonly ChainRoundRecord[], head: ChainHead) {
  const v = buildTreasuryView(t.raw);
  const cap = maxRoundExposureUnits(t.availableUnits, t.raw.maxRoundExposureBps);
  const inFlight = buildLiabilityRows(latest, Number(cap), t.raw.chipUsdValue);
  const reason = tableClosedReason(t, g);
  const usd = (units: number) => round4(unitsToUsd(units, t.raw.chipUsdValue));
  const snapshot = {
    bankroll: v.bankroll.units,
    reservedLiability: unitsJson(t.reservedUnits),
    claimableRewards: v.claimable.units,
    protocolReserve: v.protocolReserve.units,
    /** ETH the treasury has earmarked for buying reward inventory (not tokens held by the vault). */
    rewardInventoryBucket: v.hasPeg ? Number(t.raw.rewardInventoryWei / t.raw.chipPriceWei) : 0,
    /** Chip units players hold in table escrow; 0 means nobody is seated. */
    escrow: unitsJson(t.escrowUnits),
    unsettledRounds: inFlight.length,
  };
  const derived = {
    safetyReserve: v.safetyReserve.units,
    availableBankroll: unitsJson(t.availableUnits),
    maxRoundExposure: unitsJson(cap),
    totalAssets: v.totalTreasury.units,
    liabilities: v.liabilities.units,
    /** (bankroll + protocol reserve) ÷ (reserved + claimable) × 100; null while there are no liabilities. */
    collateralizationPct: v.collateralizationPct == null ? null : Math.round(v.collateralizationPct * 100) / 100,
    maxStraightStake: unitsJson(g.maxStraightUnits),
    maxOutsideStake: unitsJson(g.maxOutsideUnits),
    tableOpen: reason === null,
    reason,
    isSolvent: t.raw.isSolvent,
  };
  return {
    unit: "chip units",
    usdBasis: PEG_NOTE,
    peg: { hasPeg: v.hasPeg, chipPriceWei: t.raw.chipPriceWei.toString(), chipUsd: v.chipUsd },
    snapshot,
    derived,
    usdAtPeg: {
      bankroll: usd(snapshot.bankroll),
      reservedLiability: usd(snapshot.reservedLiability),
      claimableRewards: usd(snapshot.claimableRewards),
      protocolReserve: usd(snapshot.protocolReserve),
      safetyReserve: usd(derived.safetyReserve),
      availableBankroll: usd(derived.availableBankroll),
      maxRoundExposure: usd(derived.maxRoundExposure),
      totalAssets: usd(derived.totalAssets),
      liabilities: usd(derived.liabilities),
    },
    wei: {
      bankroll: t.raw.bankrollWei.toString(),
      reservedLiability: t.raw.reservedWei.toString(),
      claimableRewards: t.raw.claimableWei.toString(),
      protocolReserve: t.raw.protocolReserveWei.toString(),
      safetyReserve: t.raw.safetyReserveWei.toString(),
      availableBankroll: t.raw.availableWei.toString(),
      rewardInventoryBucket: t.raw.rewardInventoryWei.toString(),
    },
    inFlightRounds: inFlight.map((r) => ({ roundId: idJson(r.roundId), tableId: String(r.tableId), status: r.status, betCount: r.betCount, totalStaked: r.totalStakedUnits, reservedUnits: r.reservedUnits, pctOfCap: r.pctOfCap == null ? null : Math.round(r.pctOfCap * 100) / 100 })),
    config: {
      safetyReserveBps: t.raw.safetyReserveBps,
      maxRoundExposureBps: t.raw.maxRoundExposureBps,
      minBankrollToOpen: unitsJson(g.minBankrollToOpenUnits),
      depositSplitBps: t.split
        ? { payoutLiquidity: t.split.payoutLiquidityBps, rewardInventory: t.split.rewardInventoryBps, protocolReserve: t.split.protocolReserveBps, platformFee: t.split.platformFeeBps }
        : null,
    },
    pause: { treasury: pauseView(t.pause.treasury), game: pauseView(t.pause.game), vault: pauseView(t.pause.vault) },
    formula: {
      availableBankroll: "bankroll - reservedLiability - claimableRewards - protocolReserve - safetyReserve (CasinoTreasury.availableBankrollUnits)",
      maxRoundExposure: "floor(availableBankroll * maxRoundExposureBps / 10000)",
      maxStake: "floor(maxRoundExposure / payoutMultiplier) (RouletteGame.maxStakeFor)",
      accept: "maximumLiability(all bets in the round) <= maxRoundExposure (RiskEngine.checkWager)",
    },
    source: "CasinoTreasury + RouletteGame views on Robinhood Chain",
    block: headView(head),
  };
}

export function limitsView(t: TreasuryState, g: GameConfig, multiplier: number, existingLiability: bigint, byKind: Record<string, number>, head: ChainHead) {
  const v = buildTreasuryView(t.raw);
  const cap = maxRoundExposureUnits(t.availableUnits, t.raw.maxRoundExposureBps);
  const closed = tableClosedReason(t, g);
  const maxStake = closed === "paused" || closed === "insufficient-bankroll" ? 0n : maxSafeStakeUnits(t.availableUnits, multiplier, existingLiability, t.raw.maxRoundExposureBps);
  const maxStakeByKind = Object.fromEntries(
    Object.entries(byKind).map(([kind, m]) => [kind, closed === "paused" || closed === "insufficient-bankroll" ? 0 : unitsJson(maxSafeStakeUnits(t.availableUnits, m, 0n, t.raw.maxRoundExposureBps))]),
  );
  return {
    unit: "chip units",
    multiplier,
    existingLiability: unitsJson(existingLiability),
    availableBankroll: unitsJson(t.availableUnits),
    safetyReserve: v.safetyReserve.units,
    maxRoundExposure: unitsJson(cap),
    maxStake: unitsJson(maxStake),
    tableOpen: maxStake > 0n,
    reason: maxStake > 0n ? null : (closed ?? "exposure-cap"),
    maxStakeByKind,
    chipUsd: v.chipUsd,
    usdBasis: PEG_NOTE,
    formula: "maxStake = floor((floor(availableBankroll * exposureBps / 10000) - existingLiability) / multiplier), whole chip units (RiskEngine.maxSafeStake)",
    note: "Treasury-wide caps on an otherwise empty round. Each table also enforces its own min/max stake (see /tables).",
    block: headView(head),
  };
}

/* ---------------------------------------------------------------- tables */

export type OperatorState = "round-open" | "awaiting-reveal" | "between-rounds" | "waiting-for-players";

export interface TableViewInput {
  table: ChainTableRecord;
  /** Newest round of this table inside the scan window, if any. */
  latest: ChainRoundRecord | null;
  treasury: TreasuryState;
  game: GameConfig;
  /** Results of this table's settled rounds inside the scan window, newest first. */
  recent: readonly number[];
  bettingSeconds: number;
}

export function tableView({ table, latest, treasury, game, recent, bettingSeconds }: TableViewInput) {
  const closed = tableClosedReason(treasury, game);
  const maxBet = Number(table.maxStake);
  const treasuryMaxStraight = closed === "paused" || closed === "insufficient-bankroll" ? 0 : Number(game.maxStraightUnits);
  const treasuryMaxOutside = closed === "paused" || closed === "insufficient-bankroll" ? 0 : Number(game.maxOutsideUnits);
  const inFlight = latest && (latest.status === ROUND_STATUS.Open || latest.status === ROUND_STATUS.Closed) ? latest : null;
  const open = inFlight?.status === ROUND_STATUS.Open;
  const lockedReason = !table.active
    ? "Table is not active on chain."
    : closed === "paused"
      ? "Gameplay is paused on chain."
      : closed === "insufficient-bankroll"
        ? "Treasury available bankroll is below the minimum to open a round."
        : closed === "exposure-cap"
          ? "Treasury exposure cap leaves no room for a bet right now."
          : null;
  const operator: OperatorState = inFlight ? (open ? "round-open" : "awaiting-reveal") : treasury.escrowUnits > 0n ? "between-rounds" : "waiting-for-players";
  return {
    id: String(table.id),
    name: tableName(table.id),
    variant: "European Roulette" as const,
    status: lockedReason ? ("locked" as const) : ("live" as const),
    visibility: table.isPrivate ? ("private" as const) : ("public" as const),
    active: table.active,
    lockedReason,
    limits: {
      minBet: Number(table.minStake),
      maxBet,
      /** Effective caps = min(table max, treasury-backed max for that multiplier on an empty round). */
      maxOutside: Math.min(maxBet, treasuryMaxOutside),
      maxStraight: Math.min(maxBet, treasuryMaxStraight),
      treasuryMaxOutside,
      treasuryMaxStraight,
    },
    currentRound: inFlight
      ? {
          id: idJson(inFlight.roundId),
          status: roundStatusLabel(inFlight.status),
          acceptingBets: open,
          openedAt: inFlight.openedAt,
          betCount: inFlight.betCount,
          totalStaked: unitsJson(inFlight.totalStaked),
          reservedUnits: unitsJson(inFlight.reservedUnits),
          /** Approximate: openedAt + the operator's betting window. The window is not stored on chain; the operator closes the round. */
          betsCloseAt: open && inFlight.openedAt > 0 ? inFlight.openedAt + bettingSeconds : null,
          betsCloseAtApproximate: true as const,
          bettingWindowSeconds: bettingSeconds,
          /** Unix seconds after which anyone may void a round the operator left open. */
          timesOutAt: open && inFlight.openedAt > 0 ? inFlight.openedAt + game.roundTimeout : null,
        }
      : null,
    /**
     * round-open / awaiting-reveal: a round is in flight. between-rounds: players are seated, the next round is expected.
     * waiting-for-players: nobody has chips in escrow, so the operator opens no rounds (a normal state, not an error).
     */
    operator,
    lastRound: latest && !inFlight ? { id: idJson(latest.roundId), status: roundStatusLabel(latest.status), result: latest.status === ROUND_STATUS.Settled ? latest.result : null, openedAt: latest.openedAt } : null,
    recent: [...recent],
  };
}

/* ---------------------------------------------------------------- rounds */

const RANDOMNESS_LABEL = ["None", "Committed", "Locked", "Revealed", "Void"] as const;

export function pocketFacts(result: number) {
  return {
    color: colorOf(result),
    parity: result === 0 ? ("zero" as const) : result % 2 === 1 ? ("odd" as const) : ("even" as const),
    dozen: dozenOf(result),
    column: columnOf(result),
    half: result === 0 ? null : result <= 18 ? ("low" as const) : ("high" as const),
  };
}

export function roundView(r: ChainRoundFull, settledAtBlock?: bigint | null) {
  const rm = r.randomness;
  const settled = r.status === ROUND_STATUS.Settled;
  const revealed = rm?.status === RANDOMNESS_STATUS.Revealed;
  const locked = rm != null && (rm.status === RANDOMNESS_STATUS.Locked || revealed);
  const reveal = rm ? buildChainReveal(r.roundId, rm, r.openedAt) : null;
  // A settled round is verified when the revealed seeds reproduce the commitment and the
  // result (verifyRound), and the game settled on that same result.
  const verified = !revealed ? null : !!reveal && reveal.verified && (!settled || reveal.result === r.result);
  return {
    roundId: idJson(r.roundId),
    tableId: String(r.tableId),
    status: roundStatusLabel(r.status),
    randomnessStatus: rm ? (RANDOMNESS_LABEL[rm.status] ?? "None") : null,
    /** Unix seconds (block timestamp of openRound). */
    openedAt: r.openedAt,
    result: settled ? r.result : null,
    ...(settled ? pocketFacts(r.result) : { color: null, parity: null, dozen: null, column: null, half: null }),
    betCount: r.betCount,
    totalStaked: unitsJson(r.totalStaked),
    totalReturned: unitsJson(r.totalReturned),
    reservedUnits: unitsJson(r.reservedUnits),
    commitment: seedOrNull(rm?.commitment),
    /** Player entropy frozen at close; null while the round is still open. */
    playerSeed: locked ? seedOrNull(rm?.playerSeed) : null,
    serverSeed: revealed ? seedOrNull(rm?.serverSeed) : null,
    blockRef: revealed ? seedOrNull(rm?.blockRef) : null,
    /** Ethereum L1 block numbers (what the contracts see as block.number). */
    committedAtBlock: rm && rm.committedAtBlock > 0n ? idJson(rm.committedAtBlock) : null,
    revealAfterBlock: rm && rm.revealAfterBlock > 0n ? idJson(rm.revealAfterBlock) : null,
    /** L2 block of the RoundSettled log, when the round came from the log scan. */
    settledAtBlock: settledAtBlock == null ? null : idJson(settledAtBlock),
    verified,
  };
}
export type RoundView = ReturnType<typeof roundView>;

/** Ready-to-send POST /api/v1/verify body, or null until the seeds are revealed. */
export function verifyBody(v: RoundView) {
  if (!v.commitment || !v.serverSeed || !v.playerSeed || !v.blockRef) return null;
  return { roundId: v.roundId, commitment: v.commitment, serverSeed: v.serverSeed, playerSeed: v.playerSeed, blockRef: v.blockRef, ...(v.result != null ? { result: v.result } : {}) };
}

export function betView(b: ChainBet, index: number) {
  const betId = betIdFromContract(b.numbersMask, b.multiplier);
  const def = betId ? betFromId(betId) : null;
  let numbers: number[] = [];
  try {
    numbers = maskToNumbers(b.numbersMask);
  } catch {
    numbers = [];
  }
  return { index, player: b.player, betId, label: def?.label ?? null, numbers, numbersMaskHex: maskToHex(b.numbersMask), multiplier: b.multiplier, stake: unitsJson(b.stake) };
}

/* ----------------------------------------------------------------- stats */

export interface ScanWindowView {
  fromBlock: number | string;
  toBlock: number | string;
  blocks: number;
  /** Robinhood Chain mints roughly 10 L2 blocks per second. */
  approxMinutes: number;
}

export function scanWindowView(w: { fromBlock: bigint; toBlock: bigint }): ScanWindowView {
  const blocks = Number(w.toBlock - w.fromBlock);
  return { fromBlock: idJson(w.fromBlock), toBlock: idJson(w.toBlock), blocks, approxMinutes: Math.round(blocks / 10 / 60) };
}

/** `logs` newest first, already filtered by table. */
export function statsView(logs: readonly SettledRoundRecord[], opts: { table: string | null; window: number; chipUsdValue: bigint; scan: { fromBlock: bigint; toBlock: bigint } }) {
  const rows = logs.slice(0, opts.window);
  const color: Record<PocketColor, number> = { red: 0, black: 0, green: 0 };
  const parity = { odd: 0, even: 0, zero: 0 };
  const dozen = { "1": 0, "2": 0, "3": 0, zero: 0 };
  const column = { "1": 0, "2": 0, "3": 0, zero: 0 };
  const half = { low: 0, high: 0, zero: 0 };
  const pockets = Array.from({ length: 37 }, () => 0);
  let staked = 0n;
  let returned = 0n;
  for (const r of rows) {
    const f = pocketFacts(r.result);
    color[f.color]++;
    parity[f.parity]++;
    dozen[f.dozen === null ? "zero" : (String(f.dozen) as "1" | "2" | "3")]++;
    column[f.column === null ? "zero" : (String(f.column) as "1" | "2" | "3")]++;
    half[f.half ?? "zero"]++;
    if (r.result >= 0 && r.result <= 36) pockets[r.result]!++;
    staked += r.totalStaked;
    returned += r.totalReturned;
  }
  return {
    table: opts.table,
    window: opts.window,
    /** Settled rounds actually counted: at most `window`, and only those inside the block window below. */
    sampled: rows.length,
    roundsSettled: rows.length,
    totalStaked: unitsJson(staked),
    totalReturned: unitsJson(returned),
    usdAtPeg: { totalStaked: round4(unitsToUsd(staked, opts.chipUsdValue)), totalReturned: round4(unitsToUsd(returned, opts.chipUsdValue)) },
    color,
    parity,
    dozen,
    column,
    half,
    pockets,
    latest: rows.slice(0, 12).map((r) => r.result),
    blockWindow: scanWindowView(opts.scan),
    source: "RouletteGame.RoundSettled logs on Robinhood Chain",
    usdBasis: PEG_NOTE,
  };
}

/* --------------------------------------------------------------- rewards */

const VAULT_STATUS = ["UNAVAILABLE", "LOW", "AVAILABLE"] as const;

export function rewardsView(assets: readonly RewardAssetState[], now: number, registry: readonly RewardToken[] = rewardRegistry) {
  const byAddress = new Map(assets.map((a) => [a.address.toLowerCase(), a]));
  const rows = buildRewardRows(new Map(assets.map((a) => [a.address.toLowerCase(), a.vault])), registry);
  const known = new Set(registry.flatMap((t) => (t.contractAddress ? [t.contractAddress.toLowerCase()] : [])));

  const describe = (token: Pick<RewardToken, "id" | "symbol" | "name" | "category" | "decimals" | "note"> | null, address: Address | null, status: LiquidityStatus, minimumPayoutUsd: number, priceUsd: number | null, inventoryUsd: number | null) => {
    const s = address ? byAddress.get(address.toLowerCase()) : undefined;
    const decimals = s?.vault.registered ? s.vault.decimals : (token?.decimals ?? 18);
    const age = s?.oracleUpdatedAt != null ? Math.max(0, now - s.oracleUpdatedAt) : null;
    return {
      id: token?.id ?? `onchain-${(address ?? "").toLowerCase()}`,
      symbol: token?.symbol ?? null,
      name: token?.name ?? null,
      category: token?.category ?? null,
      /** One factual line from the app registry (e.g. the project token), never a price or value claim. */
      note: token?.note ?? null,
      contractAddress: address,
      decimals,
      /** Registered on the RewardVault (has an oracle). False = named in the app registry only. */
      registered: s?.vault.registered ?? false,
      enabled: s?.vault.enabled ?? false,
      status,
      statusLabel: REWARD_STATUS_LABEL[status],
      /** RewardVault.status enum; null when the asset is not on chain. */
      vaultStatus: s && s.vault.status != null ? (VAULT_STATUS[s.vault.status] ?? "UNAVAILABLE") : null,
      /** Vault inventory in token base units (decimal string) and whole tokens. */
      inventory: s ? s.vault.inventory.toString() : null,
      inventoryTokens: s ? Number(formatUnits(s.vault.inventory, decimals)) : null,
      /** Posted oracle price while it is fresh (what a claim would use); null when unset or stale. */
      priceUsd,
      inventoryUsd,
      minimumPayoutUsd,
      oracle: s?.oracle ?? null,
      /** Last posted price even if stale, with its age. */
      postedPriceUsd: s?.oraclePriceUsd1e18 != null ? Number(formatUnits(s.oraclePriceUsd1e18, 18)) : null,
      priceUpdatedAt: s?.oracleUpdatedAt ?? null,
      priceAgeSeconds: age,
      maxStalenessSeconds: s?.vault.registered ? s.maxStalenessSeconds : null,
      priceStale: s?.vault.registered ? age == null || age > s.maxStalenessSeconds : null,
    };
  };

  const listed = rows.map((r) => describe(r.token, (r.token.contractAddress as Address | null) ?? null, r.status, r.minimumPayoutUsd, r.priceUsd, r.inventoryUsd));
  // Assets the vault knows that the app registry does not name: shown by address, never hidden.
  const extra = assets
    .filter((a) => a.vault.registered && !known.has(a.address.toLowerCase()))
    .map((a) => {
      const status: LiquidityStatus = a.vault.status === 2 ? "available" : a.vault.status === 1 ? "low" : "unavailable";
      const priceUsd = a.vault.priceUsd1e18 != null && a.vault.priceUsd1e18 > 0n ? Number(formatUnits(a.vault.priceUsd1e18, 18)) : null;
      const tokens = Number(formatUnits(a.vault.inventory, a.vault.decimals));
      return describe(null, a.address, status, Number(formatUnits(a.vault.minimumPayoutUsd, 18)), priceUsd, priceUsd != null ? Math.round(tokens * priceUsd * 100) / 100 : null);
    });
  const all = [...listed, ...extra];
  return {
    totalInventoryUsd: Math.round(all.reduce((s, a) => s + (a.inventoryUsd ?? 0), 0) * 100) / 100,
    assets: all,
    source: "RewardVault (assets, assetConfig, status, inventory, quote) + its price oracle on Robinhood Chain",
    note: "Rewards settle from inventory the vault actually holds; an asset with zero inventory or a stale price is UNAVAILABLE and a claim would revert. Stock Token settlement is additionally gated by jurisdiction.",
  };
}

export function pricesView(assets: readonly RewardAssetState[], now: number, registry: readonly RewardToken[] = rewardRegistry) {
  const token = (a: Address) => registry.find((t) => t.contractAddress?.toLowerCase() === a.toLowerCase());
  return assets
    .filter((a) => a.vault.registered)
    .map((a) => {
      const t = token(a.address);
      const age = a.oracleUpdatedAt != null ? Math.max(0, now - a.oracleUpdatedAt) : null;
      return {
        id: t?.id ?? `onchain-${a.address.toLowerCase()}`,
        symbol: t?.symbol ?? null,
        contractAddress: a.address,
        /** Last price posted to the oracle (USD per whole token); null when none was ever posted. */
        priceUsd: a.oraclePriceUsd1e18 != null ? Number(formatUnits(a.oraclePriceUsd1e18, 18)) : null,
        priceUsd1e18: a.oraclePriceUsd1e18?.toString() ?? null,
        /** Unix seconds of the posted price. */
        updatedAt: a.oracleUpdatedAt,
        ageSeconds: age,
        maxStalenessSeconds: a.maxStalenessSeconds,
        /** True when the vault would reject a claim on this price (older than maxStalenessSeconds, or never posted). */
        stale: age == null || age > a.maxStalenessSeconds,
        source: "onchain-oracle" as const,
        oracle: a.oracle,
      };
    });
}

/* --------------------------------------------------------------- account */

export function accountView(a: AccountState) {
  return {
    address: a.address,
    walletChipUnits: a.chipUnits,
    walletChips: Object.fromEntries(Object.entries(a.chips).map(([d, n]) => [d, Number(n)])),
    escrowUnits: unitsJson(a.escrowUnits),
    chipsApproved: a.approved,
    winBalanceUsd: Number(formatUnits(a.winBalanceUsd1e18, 18)),
    withdrawableWei: a.withdrawableWei.toString(),
  };
}
