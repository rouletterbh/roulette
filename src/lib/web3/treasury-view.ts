import { formatEther } from "viem";
import { rewardRegistry, type LiquidityStatus, type RewardToken } from "@/config/tokens";
import { ROUND_STATUS, type ChainRoundStatus } from "./contracts";

/**
 * Pure chain → view-model mapping for the demo-off Treasury and Tables pages.
 * No I/O: the hooks in ./hooks.ts feed raw contract values in; components render
 * what comes out. Every USD figure here is derived from the treasury's own chip
 * peg (`chipUsdValue`, 1e18 fixed, USD per chip unit), never from an ETH/USD
 * price we do not have on chain. Callers must say so in a microlabel.
 */

export const USD_SCALE = 10n ** 18n;
const BPS = 10_000n;

/* --------------------------------------------------------------- scalars */

/** Chip units a wei amount represents at `chipPriceWei` (floor; 0 when the price is unset). */
export function weiToUnits(wei: bigint, chipPriceWei: bigint): number {
  return chipPriceWei > 0n ? Number(wei / chipPriceWei) : 0;
}

/** USD at the chip peg for a wei amount: wei × chipUsdValue ÷ chipPriceWei ÷ 1e18. */
export function weiToUsd(wei: bigint, chipPriceWei: bigint, chipUsdValue: bigint): number {
  if (chipPriceWei <= 0n) return 0;
  return Number((wei * chipUsdValue) / chipPriceWei) / 1e18;
}

/** USD at the chip peg for a number of chip units. */
export function unitsToUsd(units: bigint | number, chipUsdValue: bigint): number {
  const u = typeof units === "bigint" ? units : BigInt(Math.max(0, Math.floor(units)));
  return Number(u * chipUsdValue) / 1e18;
}

/** ETH string without trailing zeros, e.g. "0.03 ETH". */
export function formatEth(wei: bigint, digits = 6): string {
  const s = Number(formatEther(wei)).toFixed(digits).replace(/\.?0+$/, "");
  return `${s === "" || s === "-" ? "0" : s} ETH`;
}

/** mm:ss, or h:mm:ss above an hour. */
export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mm}` : mm;
}

/* ------------------------------------------------------------- treasury */

export interface TreasuryRaw {
  bankrollWei: bigint;
  reservedWei: bigint;
  claimableWei: bigint;
  protocolReserveWei: bigint;
  safetyReserveWei: bigint;
  availableWei: bigint;
  /** ETH earmarked for buying reward inventory (treasury bucket, not vault tokens). */
  rewardInventoryWei: bigint;
  chipPriceWei: bigint;
  chipUsdValue: bigint;
  safetyReserveBps: number;
  maxRoundExposureBps: number;
  isSolvent: boolean;
}

export interface Money {
  wei: bigint;
  units: number;
  usd: number;
}

export interface TreasuryView {
  /** False until chipPriceWei is known; USD/units are then 0 and must render as "—". */
  hasPeg: boolean;
  chipUsd: number;
  chipPriceWei: bigint;
  bankroll: Money;
  reserved: Money;
  claimable: Money;
  protocolReserve: Money;
  safetyReserve: Money;
  available: Money;
  exposureCap: Money;
  /** Largest straight-up stake (chip units) the risk engine accepts right now: cap ÷ 35. */
  maxStraightUnits: number;
  maxStraightUsd: number;
  totalTreasury: Money;
  liabilities: Money;
  /** (bankroll + protocol reserve) ÷ (reserved + claimable), %; null when there are no liabilities. */
  collateralizationPct: number | null;
  /** reserved ÷ available, %; null when nothing is available. */
  exposurePct: number | null;
  safetyReserveBps: number;
  maxRoundExposureBps: number;
  isSolvent: boolean;
  derivation: Array<[string, string, "sum" | "result" | undefined]>;
  allocation: Array<{ label: string; value: number }>;
}

const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function buildTreasuryView(raw: TreasuryRaw): TreasuryView {
  const { chipPriceWei, chipUsdValue } = raw;
  const hasPeg = chipPriceWei > 0n && chipUsdValue > 0n;
  const money = (wei: bigint): Money => ({ wei, units: weiToUnits(wei, chipPriceWei), usd: weiToUsd(wei, chipPriceWei, chipUsdValue) });

  const bankroll = money(raw.bankrollWei);
  const reserved = money(raw.reservedWei);
  const claimable = money(raw.claimableWei);
  const protocolReserve = money(raw.protocolReserveWei);
  const safetyReserve = money(raw.safetyReserveWei);
  const available = money(raw.availableWei);
  const capBps = BigInt(raw.maxRoundExposureBps);
  const exposureCap = money((raw.availableWei * capBps) / BPS);
  // Mirrors RiskEngine.maxSafeStake(availableBankrollUnits, 35, 0, exposureBps): integer maths on units.
  const availableUnits = chipPriceWei > 0n ? raw.availableWei / chipPriceWei : 0n;
  const maxStraightUnits = Number((availableUnits * capBps) / BPS / 35n);
  const totalTreasury = money(raw.bankrollWei + raw.protocolReserveWei + raw.rewardInventoryWei);
  const liabilities = money(raw.reservedWei + raw.claimableWei);
  const collateralizationPct = liabilities.wei > 0n ? (Number(((raw.bankrollWei + raw.protocolReserveWei) * 1_000_000n) / liabilities.wei) / 1_000_000) * 100 : null;
  const exposurePct = raw.availableWei > 0n ? (Number((raw.reservedWei * 1_000_000n) / raw.availableWei) / 1_000_000) * 100 : null;
  const u = (m: Money) => (hasPeg ? `${fmtUsd(m.usd)} · ${m.units.toLocaleString("en-US")} units` : formatEth(m.wei));

  return {
    hasPeg,
    chipUsd: Number(chipUsdValue) / 1e18,
    chipPriceWei,
    bankroll,
    reserved,
    claimable,
    protocolReserve,
    safetyReserve,
    available,
    exposureCap,
    maxStraightUnits,
    maxStraightUsd: unitsToUsd(maxStraightUnits, chipUsdValue),
    totalTreasury,
    liabilities,
    collateralizationPct,
    exposurePct,
    safetyReserveBps: raw.safetyReserveBps,
    maxRoundExposureBps: raw.maxRoundExposureBps,
    isSolvent: raw.isSolvent,
    derivation: [
      ["Bankroll", u(bankroll), undefined],
      ["− reserved liabilities", u(reserved), undefined],
      ["− claimable rewards", u(claimable), undefined],
      ["− protocol reserve", u(protocolReserve), undefined],
      [`− safety reserve (${raw.safetyReserveBps / 100}%)`, u(safetyReserve), undefined],
      ["= available bankroll", u(available), "sum"],
      [`× per-round exposure cap (${raw.maxRoundExposureBps / 100}%)`, u(exposureCap), undefined],
      ["÷ 35 (straight-up payout)", hasPeg ? `${maxStraightUnits.toLocaleString("en-US")} units max straight bet` : "—", "result"],
    ],
    allocation: [
      { label: "Available liquidity", value: available.usd },
      { label: "Reserved liabilities", value: reserved.usd },
      { label: "Safety reserve", value: safetyReserve.usd },
      { label: "Protocol reserve", value: protocolReserve.usd },
      { label: "Reward inventory", value: weiToUsd(raw.rewardInventoryWei, chipPriceWei, chipUsdValue) },
    ],
  };
}

/* ---------------------------------------------------------------- rounds */

export type RoundPhaseLabel = "Open" | "Closed" | "Settled" | "Voided" | "None";

export function roundStatusLabel(status: ChainRoundStatus | number): RoundPhaseLabel {
  switch (status) {
    case ROUND_STATUS.Open:
      return "Open";
    case ROUND_STATUS.Closed:
      return "Closed";
    case ROUND_STATUS.Settled:
      return "Settled";
    case ROUND_STATUS.Voided:
      return "Voided";
    default:
      return "None";
  }
}

/** Latest round per table as read from `getRound`. */
export interface ChainRoundRecord {
  tableId: number;
  roundId: bigint;
  status: ChainRoundStatus;
  result: number;
  openedAt: number;
  betCount: number;
  totalStaked: bigint;
  totalReturned: bigint;
  reservedUnits: bigint;
}

export interface LiabilityRow {
  roundId: bigint;
  tableId: number;
  status: RoundPhaseLabel;
  betCount: number;
  totalStakedUnits: number;
  reservedUnits: number;
  reservedUsd: number;
  /** reserved ÷ per-round cap, %; null when the cap is 0. */
  pctOfCap: number | null;
}

/** Rounds still reserving capacity (Open or Closed), one row each, sorted by table. */
export function buildLiabilityRows(rounds: readonly ChainRoundRecord[], capUnits: number, chipUsdValue: bigint): LiabilityRow[] {
  return rounds
    .filter((r) => r.status === ROUND_STATUS.Open || r.status === ROUND_STATUS.Closed)
    .sort((a, b) => a.tableId - b.tableId)
    .map((r) => {
      const reservedUnits = Number(r.reservedUnits);
      return {
        roundId: r.roundId,
        tableId: r.tableId,
        status: roundStatusLabel(r.status),
        betCount: r.betCount,
        totalStakedUnits: Number(r.totalStaked),
        reservedUnits,
        reservedUsd: unitsToUsd(r.reservedUnits, chipUsdValue),
        pctOfCap: capUnits > 0 ? (reservedUnits / capUnits) * 100 : null,
      };
    });
}

/* ---------------------------------------------------------------- tables */

export interface ChainTableRecord {
  id: number;
  minStake: bigint;
  maxStake: bigint;
  isPrivate: boolean;
  active: boolean;
}

export interface TableRowView {
  id: number;
  name: string;
  minStake: number;
  maxStake: number;
  isPrivate: boolean;
  active: boolean;
  /** min(maxStake, maxStakeFor(35)): the straight-up stake the treasury backs right now. */
  effectiveMaxStraight: number;
  /** True when the table's nominal maximum exceeds what the treasury can back on a straight-up bet. */
  treasuryLimited: boolean;
  round: {
    roundId: bigint;
    status: RoundPhaseLabel;
    betCount: number;
    totalStakedUnits: number;
    openedAt: number;
    /** Unix seconds after which an Open round can be voided (openedAt + roundTimeout); null unless Open. */
    timesOutAt: number | null;
    result: number | null;
  } | null;
  /** Play route: the default chain table uses the quick-play route the chain driver already serves. */
  href: string;
}

export function tableName(id: number) {
  return `Table ${id}`;
}

export function buildTableRows(
  tables: readonly ChainTableRecord[],
  rounds: readonly ChainRoundRecord[],
  opts: { maxStraightUnits: number; roundTimeout: number; defaultTableId: number },
): TableRowView[] {
  const byTable = new Map<number, ChainRoundRecord>();
  for (const r of rounds) {
    const prev = byTable.get(r.tableId);
    if (!prev || r.roundId > prev.roundId) byTable.set(r.tableId, r);
  }
  return tables
    .filter((t) => !t.isPrivate)
    .map((t) => {
      const r = byTable.get(t.id) ?? null;
      const maxStake = Number(t.maxStake);
      const effective = Math.min(maxStake, opts.maxStraightUnits);
      return {
        id: t.id,
        name: tableName(t.id),
        minStake: Number(t.minStake),
        maxStake,
        isPrivate: t.isPrivate,
        active: t.active,
        effectiveMaxStraight: effective,
        treasuryLimited: opts.maxStraightUnits < maxStake,
        round: r
          ? {
              roundId: r.roundId,
              status: roundStatusLabel(r.status),
              betCount: r.betCount,
              totalStakedUnits: Number(r.totalStaked),
              openedAt: r.openedAt,
              timesOutAt: r.status === ROUND_STATUS.Open && r.openedAt > 0 ? r.openedAt + opts.roundTimeout : null,
              result: r.status === ROUND_STATUS.Settled ? r.result : null,
            }
          : null,
        href: t.id === opts.defaultTableId ? "/play/quick" : `/table/${t.id}`,
      };
    });
}

/* --------------------------------------------------------------- rewards */

export const REWARD_STATUS_LABEL: Record<LiquidityStatus, string> = {
  available: "Available",
  low: "Low inventory",
  unavailable: "Temporarily unavailable",
  unverified: "Not yet listed",
};

/** Raw vault reads for one registered asset (undefined fields = call failed / not registered). */
export interface VaultAssetRaw {
  registered: boolean;
  enabled: boolean;
  decimals: number;
  /** AssetStatus enum: 0 UNAVAILABLE, 1 LOW, 2 AVAILABLE. */
  status: number | undefined;
  inventory: bigint;
  minimumPayoutUsd: bigint;
  /** Oracle price, USD 1e18, from `quote`; undefined when the quote reverted (stale/unset). */
  priceUsd1e18: bigint | undefined;
}

export interface RewardRowView {
  token: RewardToken;
  status: LiquidityStatus;
  statusLabel: string;
  /** Whole tokens held by the vault; null when the asset is not on chain. */
  inventoryTokens: number | null;
  /** Oracle price in USD; null when there is no fresh posted price. */
  priceUsd: number | null;
  /** inventory × price; null when either side is unknown. */
  inventoryUsd: number | null;
  minimumPayoutUsd: number;
}

const ASSET_STATUS: LiquidityStatus[] = ["unavailable", "low", "available"];

export function buildRewardRows(byAddress: ReadonlyMap<string, VaultAssetRaw>, registry: readonly RewardToken[] = rewardRegistry): RewardRowView[] {
  return registry.map((token) => {
    const raw = token.contractAddress ? byAddress.get(token.contractAddress.toLowerCase()) : undefined;
    if (!token.contractAddress) {
      return { token, status: "unverified", statusLabel: REWARD_STATUS_LABEL.unverified, inventoryTokens: null, priceUsd: null, inventoryUsd: null, minimumPayoutUsd: token.minimumPayout };
    }
    if (!raw) {
      // Listed in the registry but the vault could not be read (address unset or call failed).
      return { token, status: "unavailable", statusLabel: REWARD_STATUS_LABEL.unavailable, inventoryTokens: null, priceUsd: null, inventoryUsd: null, minimumPayoutUsd: token.minimumPayout };
    }
    if (!raw.registered) {
      // On chain but not registered on the vault (e.g. RBL before RegisterRbl runs): nothing can be claimed and
      // no inventory or price exists for it, so it is "Not yet listed", not "temporarily" anything.
      return { token, status: "unverified", statusLabel: REWARD_STATUS_LABEL.unverified, inventoryTokens: null, priceUsd: null, inventoryUsd: null, minimumPayoutUsd: token.minimumPayout };
    }
    const status: LiquidityStatus = raw.status != null ? ASSET_STATUS[raw.status] ?? "unavailable" : "unavailable";
    const inventoryTokens = Number(raw.inventory) / 10 ** raw.decimals;
    const priceUsd = raw.priceUsd1e18 != null && raw.priceUsd1e18 > 0n ? Number(raw.priceUsd1e18) / 1e18 : null;
    return {
      token,
      status,
      statusLabel: REWARD_STATUS_LABEL[status],
      inventoryTokens,
      priceUsd,
      inventoryUsd: priceUsd != null ? Math.round(inventoryTokens * priceUsd * 100) / 100 : null,
      minimumPayoutUsd: Number(raw.minimumPayoutUsd) / 1e18,
    };
  });
}

export const totalRewardInventoryUsd = (rows: readonly RewardRowView[]) => rows.reduce((s, r) => s + (r.inventoryUsd ?? 0), 0);

/* ---------------------------------------------------------------- history */

export interface SettledRoundRecord {
  roundId: bigint;
  result: number;
  totalStaked: bigint;
  totalReturned: bigint;
  blockNumber: bigint;
}

export interface FlowPoint {
  day: string;
  wagers: number;
  payouts: number;
}

/**
 * RoundSettled events → chart points (USD at the chip peg), oldest first, last `limit`
 * rounds. The x label is the round id: block timestamps are not fetched, so no day
 * axis is invented.
 */
export function buildFlowSeries(logs: readonly SettledRoundRecord[], chipUsdValue: bigint, limit = 30): { points: FlowPoint[]; wagersUsd: number; payoutsUsd: number; rounds: number } {
  const sorted = [...logs].sort((a, b) => (a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0));
  const wagersUsd = sorted.reduce((s, l) => s + unitsToUsd(l.totalStaked, chipUsdValue), 0);
  const payoutsUsd = sorted.reduce((s, l) => s + unitsToUsd(l.totalReturned, chipUsdValue), 0);
  const points = sorted.slice(-limit).map((l) => ({ day: `#${l.roundId}`, wagers: unitsToUsd(l.totalStaked, chipUsdValue), payouts: unitsToUsd(l.totalReturned, chipUsdValue) }));
  return { points, wagersUsd, payoutsUsd, rounds: sorted.length };
}
