import { z } from "zod";
import { BaseError, formatEther, formatUnits, parseUnits, type Address } from "viem";
import { activeChain } from "@/config/chains";
import { siteConfig } from "@/config/site";
import { chipDenominations, chipTokenIds, rewardRegistry, type ChipDenomination } from "@/config/tokens";
import { PAYOUT } from "@/lib/roulette/bets";
import { BETTING_WINDOW_SECONDS, ROUND_STATUS, resolveChainTableId, selectAllChips, selectChips, type ChipSelection, chipIdToDenomination } from "@/lib/web3/contracts";
import { CLAIM_DEADLINE_MINUTES, CLAIM_SLIPPAGE_BPS, claimLimit, convertBackingWei, convertCreditUsd1e18, deadlineIn, withSlippage, type ClaimLimit } from "@/lib/web3/claim-math";
import { ContractNotConfiguredError, type AccountState, type ChainReader, type ChainRoundFull, type RewardAssetState } from "@/lib/web3/server";
import { roundStatusLabel, type ChainRoundRecord, type ChainTableRecord } from "@/lib/web3/treasury-view";
import { checkWagerUnits, maxSafeStakeUnits, maximumLiabilityUnits } from "@/lib/risk/units";
import { API_VERSION, callerAddress, err, ok, type ErrorCode } from "./envelope";
import { encodeBet, type ContractBet } from "./encode-bets";
import { buildApprovalIntent, buildClaimIntent, buildConvertToRewardsIntent, buildEnterTableIntent, buildLeaveTableIntent, buildPlaceBetsIntent, type ChipLot, type IntentAddresses } from "./intents";
import { BetInputSchema, IntentBetInputSchema, QuoteError, resolveBets, type QuoteLine } from "./quote";
import {
  PROOF_FORMULA,
  accountView,
  betView,
  claimsPaused,
  gameplayPaused,
  headView,
  idJson,
  limitsView,
  pauseView,
  pricesView,
  rewardsView,
  roundView,
  scanWindowView,
  statsView,
  tableView,
  treasuryView,
  verifyBody,
} from "./chain-views";

/**
 * Chain-backed handlers for /api/v1 (used when NEXT_PUBLIC_DEMO_MODE=false). Each takes
 * a `ChainReader`, so the route files stay one-liners and tests run against a fake
 * reader with no network. Nothing here is simulated: a handler returns what the chain
 * says, or an error envelope with a specific code. Responses carry `demo: false`.
 */

/* ----------------------------------------------------------------- errors */

/** A precondition the chain says is not met. Rendered as the standard error envelope. */
export class ApiFailure extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

const LIVE = { demo: false } as const;

/** Cache-Control max-age (seconds) for chain reads: in step with the reader's hot TTL. */
/** Below this the operator has gas for only ~60 played rounds; /health raises a warning. */
export const OPERATOR_LOW_GAS_WEI = 10n ** 15n;

export const CHAIN_MAX_AGE = { hot: 4, history: 15, finalRound: 60, health: 5 } as const;

/** Runs a handler and maps failures to the error envelope. RPC errors are never cached or papered over. */
export async function chainRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiFailure) return err(e.code, e.message, { details: e.details, ...LIVE });
    if (e instanceof QuoteError) return err(e.code, e.message, { details: e.details, ...LIVE });
    if (e instanceof ContractNotConfiguredError) {
      return err("CONTRACTS_NOT_DEPLOYED", `${e.message}. Nothing is simulated in its place.`, { details: { contract: e.contract }, ...LIVE });
    }
    const reason = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
    console.error("[api/v1] chain read failed:", reason);
    const res = err("CHAIN_UNAVAILABLE", "Robinhood Chain could not be read just now. Nothing is simulated in its place; retry in a few seconds.", { details: { reason: reason.slice(0, 300) }, ...LIVE });
    res.headers.set("Retry-After", "5");
    return res;
  }
}

/* ---------------------------------------------------------------- helpers */

const TABLE_ID = /^[1-9]\d{0,9}$/;

/** Chain tables are numeric ids ("1"). Legacy demo ids such as "neon-01" do not exist on chain: NOT_FOUND. */
function findTable(tables: readonly ChainTableRecord[], id: string): ChainTableRecord {
  const t = TABLE_ID.test(id) ? tables.find((x) => x.id === Number(id)) : undefined;
  if (!t) {
    throw new ApiFailure("NOT_FOUND", `Unknown table "${id}". Tables are on-chain numeric ids (GET /api/v1/tables lists them).`, { tables: tables.map((x) => String(x.id)) });
  }
  return t;
}

function intentAddresses(reader: ChainReader): IntentAddresses {
  const a = reader.addresses;
  return { RouletteGame: a.game, Chip1155: a.chip, CasinoTreasury: a.treasury, RewardVault: a.rewardVault };
}

/** Fails with CONTRACTS_NOT_DEPLOYED rather than returning an intent with a null target. */
function requireContracts(reader: ChainReader, keys: ReadonlyArray<keyof ChainReader["addresses"]>) {
  for (const k of keys) if (!reader.addresses[k]) throw new ContractNotConfiguredError(k);
}

/** Results of settled rounds per table (newest first) from the RoundSettled window. */
async function settledByTable(reader: ChainReader, limit = 100) {
  const { logs, window } = await reader.settledRounds();
  const newest = [...logs].sort((a, b) => (a.roundId < b.roundId ? 1 : a.roundId > b.roundId ? -1 : 0)).slice(0, limit);
  const full = await reader.rounds(newest.map((l) => l.roundId));
  const tableOf = new Map(full.map((r) => [r.roundId, r.tableId]));
  return { newest, tableOf, window, full };
}

/* ----------------------------------------------------------------- reads */

export function chainTables(reader: ChainReader) {
  return chainRoute(async () => {
    const [tables, treasury, game, latest, settled] = await Promise.all([reader.tables(), reader.treasury(), reader.game(), reader.latestRounds(), settledByTable(reader, 60)]);
    const rows = tables.map((table) =>
      tableView({
        table,
        latest: latest.rounds.find((r) => r.tableId === table.id) ?? null,
        treasury,
        game,
        recent: settled.newest.filter((l) => settled.tableOf.get(l.roundId) === table.id).slice(0, 12).map((l) => l.result),
        bettingSeconds: BETTING_WINDOW_SECONDS,
      }),
    );
    return ok({ tables: rows, count: rows.length, unit: "chip units", scanWindow: scanWindowView(latest.window), source: "RouletteGame.tables / maxStakeFor / getRound + RoundOpened logs on Robinhood Chain" }, { ...LIVE, maxAge: CHAIN_MAX_AGE.hot });
  });
}

export function chainTable(reader: ChainReader, id: string) {
  return chainRoute(async () => {
    const tables = await reader.tables();
    const table = findTable(tables, id);
    const [treasury, game, latest, settled] = await Promise.all([reader.treasury(), reader.game(), reader.latestRounds(), settledByTable(reader, 60)]);
    const view = tableView({
      table,
      latest: latest.rounds.find((r) => r.tableId === table.id) ?? null,
      treasury,
      game,
      recent: settled.newest.filter((l) => settled.tableOf.get(l.roundId) === table.id).slice(0, 12).map((l) => l.result),
      bettingSeconds: BETTING_WINDOW_SECONDS,
    });
    return ok({ table: view, unit: "chip units", scanWindow: scanWindowView(latest.window) }, { ...LIVE, maxAge: CHAIN_MAX_AGE.hot });
  });
}

export function chainTreasury(reader: ChainReader) {
  return chainRoute(async () => {
    const [treasury, game, latest, head] = await Promise.all([reader.treasury(), reader.game(), reader.latestRounds(), reader.head()]);
    return ok(treasuryView(treasury, game, latest.rounds, head), { ...LIVE, maxAge: CHAIN_MAX_AGE.hot });
  });
}

export const ChainLimitsQuery = z.object({
  multiplier: z.coerce.number().int().min(1).max(65535).default(35),
  /** Net liability already reserved in the round (whole chip units). */
  existingLiability: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
});

export function chainLimits(reader: ChainReader, q: z.infer<typeof ChainLimitsQuery>) {
  return chainRoute(async () => {
    const [treasury, game, head] = await Promise.all([reader.treasury(), reader.game(), reader.head()]);
    return ok(limitsView(treasury, game, q.multiplier, BigInt(q.existingLiability), PAYOUT, head), { ...LIVE, maxAge: CHAIN_MAX_AGE.hot });
  });
}

export const ChainRoundsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Return rounds with roundId strictly below this value. */
  cursor: z.string().regex(/^\d{1,78}$/).optional(),
  table: z.string().min(1).max(64).optional(),
});

export function chainRounds(reader: ChainReader, q: z.infer<typeof ChainRoundsQuery>) {
  return chainRoute(async () => {
    if (q.table) findTable(await reader.tables(), q.table);
    const { logs, window } = await reader.settledRounds();
    const cursor = q.cursor ? BigInt(q.cursor) : null;
    let rows = [...logs].sort((a, b) => (a.roundId < b.roundId ? 1 : a.roundId > b.roundId ? -1 : 0));
    if (cursor != null) rows = rows.filter((l) => l.roundId < cursor);
    const blockOf = new Map(rows.map((l) => [l.roundId, l.blockNumber]));
    let full: ChainRoundFull[];
    let total: number;
    if (q.table) {
      // The RoundSettled log carries no table id, so the filter needs the round records.
      const all = (await reader.rounds(rows.map((l) => l.roundId))).filter((r) => String(r.tableId) === q.table);
      total = all.length;
      full = all;
    } else {
      total = rows.length;
      full = await reader.rounds(rows.slice(0, q.limit + 1).map((l) => l.roundId));
    }
    const page = full.slice(0, q.limit);
    const nextCursor = full.length > q.limit && page.length ? idJson(page[page.length - 1]!.roundId) : null;
    return ok(
      {
        rounds: page.map((r) => roundView(r, blockOf.get(r.roundId) ?? null)),
        nextCursor,
        /** Settled rounds inside the scanned block window (not all-time). */
        total,
        scanWindow: scanWindowView(window),
        note: "Settled rounds from RoundSettled logs inside scanWindow, newest first. Older rounds are still readable one by one at /api/v1/rounds/{id}.",
        proof: PROOF_FORMULA,
        unit: "chip units",
      },
      { ...LIVE, maxAge: CHAIN_MAX_AGE.history },
    );
  });
}

export function chainRound(reader: ChainReader, id: string) {
  return chainRoute(async () => {
    if (!/^\d{1,78}$/.test(id)) throw new ApiFailure("VALIDATION_ERROR", "Round id must be a non-negative integer (uint256)");
    const roundId = BigInt(id);
    if (roundId >= 1n << 256n) throw new ApiFailure("VALIDATION_ERROR", "Round id does not fit in uint256");
    const r = await reader.round(roundId);
    if (!r) throw new ApiFailure("NOT_FOUND", `Unknown round ${id}: RouletteGame has no round with this id`);
    const bets = r.betCount > 0 ? await reader.bets(roundId) : [];
    const view = roundView(r);
    const body = verifyBody(view);
    const final = r.status === ROUND_STATUS.Settled || r.status === ROUND_STATUS.Voided;
    return ok(
      {
        round: view,
        bets: bets.map(betView),
        verify: body ? { endpoint: "/api/v1/verify", body } : null,
        proof: PROOF_FORMULA,
        unit: "chip units",
        source: "RouletteGame.getRound / getBets + RandomnessManager.getRound on Robinhood Chain",
      },
      { ...LIVE, maxAge: final ? CHAIN_MAX_AGE.finalRound : CHAIN_MAX_AGE.hot },
    );
  });
}

export const ChainStatsQuery = z.object({
  table: z.string().min(1).max(64).optional(),
  window: z.coerce.number().int().min(1).max(480).default(100),
});

export function chainStats(reader: ChainReader, q: z.infer<typeof ChainStatsQuery>) {
  return chainRoute(async () => {
    if (q.table) findTable(await reader.tables(), q.table);
    const [{ logs, window }, treasury] = await Promise.all([reader.settledRounds(), reader.treasury()]);
    let rows = [...logs].sort((a, b) => (a.roundId < b.roundId ? 1 : a.roundId > b.roundId ? -1 : 0));
    if (q.table) {
      const full = await reader.rounds(rows.map((l) => l.roundId));
      const keep = new Set(full.filter((r) => String(r.tableId) === q.table).map((r) => r.roundId));
      rows = rows.filter((l) => keep.has(l.roundId));
    }
    return ok(
      {
        ...statsView(rows, { table: q.table ?? null, window: q.window, chipUsdValue: treasury.raw.chipUsdValue, scan: window }),
        /** Expected shares on a single-zero wheel, for reference only. */
        expected: { red: 18 / 37, black: 18 / 37, green: 1 / 37, odd: 18 / 37, even: 18 / 37, dozen: 12 / 37, column: 12 / 37, pocket: 1 / 37 },
        note: "Descriptive counts of rounds settled on chain inside blockWindow. Player counts and all-time totals are not derivable from the scan and are not reported. Every spin is independent; past results carry no information about future results.",
      },
      { ...LIVE, maxAge: CHAIN_MAX_AGE.history },
    );
  });
}

export function chainRewards(reader: ChainReader) {
  return chainRoute(async () => {
    const [assets, totals, head] = await Promise.all([reader.rewardAssets(), reader.vaultTotals(), reader.head()]);
    return ok(
      {
        ...rewardsView(assets, head.timestamp),
        vault: {
          address: reader.addresses.rewardVault,
          totalWinBalanceUsd: Number(totals.totalWinBalanceUsd1e18) / 1e18,
          totalCreditedUsd: Number(totals.totalCreditedUsd1e18) / 1e18,
          totalClaimedUsd: Number(totals.totalClaimedUsd1e18) / 1e18,
        },
        block: headView(head),
      },
      { ...LIVE, maxAge: CHAIN_MAX_AGE.hot },
    );
  });
}

export function chainPrices(reader: ChainReader) {
  return chainRoute(async () => {
    const [assets, head] = await Promise.all([reader.rewardAssets(), reader.head()]);
    return ok(pricesView(assets, head.timestamp), { ...LIVE, maxAge: CHAIN_MAX_AGE.hot });
  });
}

/** `health.token`: the project token, with a note that follows the vault (a reward asset only once registered there). */
function projectToken(registeredOnVault: boolean) {
  return {
    name: siteConfig.token.name,
    symbol: siteConfig.token.symbol,
    address: siteConfig.token.address,
    chainId: siteConfig.token.chainId,
    /** True when RewardVault.assetConfig(token).oracle is set: winnings can then be collected as this token. */
    rewardAsset: registeredOnVault,
    note: registeredOnVault
      ? "project token; a reward asset on the vault: winnings can be collected as RBL at the posted oracle price from vault inventory bought on its launch curve. Not required to play"
      : "project token; not required to play and not a reward asset",
  };
}

/** Health never fails on an unreachable chain: it reports it. */
export async function chainHealth(reader: ChainReader): Promise<Response> {
  const a = reader.addresses;
  const contracts = {
    RouletteGame: a.game,
    Chip1155: a.chip,
    CasinoTreasury: a.treasury,
    RewardVault: a.rewardVault,
    RandomnessManager: a.randomness,
    RiskEngine: a.riskEngine,
    PostedPriceOracle: a.priceOracle,
    AccessController: a.accessController,
  };
  const contractsDeployed = !!(a.game && a.chip && a.treasury && a.rewardVault && a.randomness);
  const base = {
    version: API_VERSION,
    product: siteConfig.name,
    network: "Robinhood Chain",
    demoMode: false,
    contractsDeployed,
    contracts,
    capabilities: ["read", "verify", "quote", "intents"],
    signing: "never: write routes return unsigned transaction intents for the agent's own wallet",
    dataSource: "Robinhood Chain (read live through a short server-side cache); nothing is simulated",
    links: { openapi: "/api/v1/openapi.json", datasets: "/api/v1/datasets", docs: "/developers", site: siteConfig.url, x: siteConfig.socials.x.href },
    token: projectToken(false),
  };
  const chain = { id: activeChain.id, name: activeChain.name, env: siteConfig.chainEnv, explorer: activeChain.blockExplorers.default.url, nativeCurrency: activeChain.nativeCurrency.symbol };
  const settle = async <T,>(p: Promise<T>): Promise<{ value: T } | { error: string }> =>
    p.then(
      (value) => ({ value }),
      (e: unknown) => ({ error: e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e) }),
    );
  const [head, treasury, latest, assets, opWallet] = await Promise.all([settle(reader.head()), settle(reader.treasury()), settle(reader.latestRounds()), settle(reader.rewardAssets()), settle(reader.operatorWallet())]);
  // The project token's note follows the vault: it is a reward asset only once the owner has registered it there.
  const rbl = "value" in assets ? assets.value.find((x) => x.address.toLowerCase() === siteConfig.token.address.toLowerCase()) : undefined;
  const token = projectToken(rbl?.vault.registered ?? false);
  if ("error" in head) {
    return ok(
      { status: "degraded", ...base, chain: { ...chain, reachable: false, error: head.error.slice(0, 300) }, time: new Date().toISOString() },
      { ...LIVE },
    );
  }
  const now = head.value.timestamp;
  const t = "value" in treasury ? treasury.value : null;
  const l = "value" in latest ? latest.value : null;
  const newestRound = l?.rounds.length ? l.rounds.reduce((x, y) => (y.roundId > x.roundId ? y : x)) : null;
  const priced = "value" in assets ? assets.value.filter((x) => x.oracleUpdatedAt != null) : [];
  const newestPrice = priced.length ? Math.max(...priced.map((x) => x.oracleUpdatedAt!)) : null;
  const problems = [treasury, latest, assets].flatMap((r) => ("error" in r ? [r.error.slice(0, 200)] : []));
  const w = "value" in opWallet ? opWallet.value : null;
  const lowGas = w != null && w.balanceWei < OPERATOR_LOW_GAS_WEI;
  const warnings = lowGas ? [`Operator wallet ${w.address} holds ${formatEther(w.balanceWei)} ETH: below ${formatEther(OPERATOR_LOW_GAS_WEI)} ETH. Top it up or rounds and price posts will stop.`] : [];
  return ok(
    {
      status: problems.length || !contractsDeployed || (t && !t.raw.isSolvent) ? "degraded" : "ok",
      ...base,
      token,
      chain: { ...chain, reachable: true, latestBlock: idJson(head.value.blockNumber), l1BlockNumber: head.value.l1BlockNumber == null ? null : idJson(head.value.l1BlockNumber), blockTime: now },
      paused: t ? { treasury: pauseView(t.pause.treasury), game: pauseView(t.pause.game), vault: pauseView(t.pause.vault) } : null,
      treasury: t ? { solvent: t.raw.isSolvent, availableBankroll: Number(t.availableUnits), unit: "chip units" } : null,
      operator: {
        /** Liveness signals read from chain; the API has no connection to the operator process itself. */
        lastRoundOpened: newestRound ? { roundId: idJson(newestRound.roundId), tableId: String(newestRound.tableId), status: roundStatusLabel(newestRound.status), openedAt: newestRound.openedAt, ageSeconds: Math.max(0, now - newestRound.openedAt) } : null,
        lastRoundOpenedNote: newestRound ? null : l ? `No RoundOpened log in the last ${Number(l.window.toBlock - l.window.fromBlock)} blocks.` : null,
        newestOraclePrice: newestPrice != null ? { updatedAt: newestPrice, ageSeconds: Math.max(0, now - newestPrice) } : null,
        seatedEscrowUnits: t ? Number(t.escrowUnits) : null,
        /** Gas wallet of the operator, inferred from the newest round or oracle post. null when no recent activity is visible. */
        wallet: w ? { address: w.address, balanceEth: formatEther(w.balanceWei), balanceWei: w.balanceWei.toString(), lowGas, lowGasThresholdEth: formatEther(OPERATOR_LOW_GAS_WEI), source: w.source } : null,
        mode: "seated-only: rounds open only while someone has chips in table escrow, so an idle table is normal",
      },
      scanWindow: l ? scanWindowView(l.window) : null,
      problems,
      warnings,
      time: new Date().toISOString(),
    },
    { ...LIVE, maxAge: CHAIN_MAX_AGE.health },
  );
}

/* ------------------------------------------------------------------ quote */

export const ChainQuoteBodySchema = z.object({
  bets: z.array(BetInputSchema).min(1).max(64),
  /** On-chain table id ("1"). Applies the table's stake range and its open round's existing bets. */
  table: z.string().min(1).max(64).optional(),
  /** Quote against this round instead of the table's current one. */
  roundId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,78}$/)]).optional(),
});
export type ChainQuoteBody = z.infer<typeof ChainQuoteBodySchema>;

export type QuoteRejection = "paused" | "table-inactive" | "round-not-open" | "stake-out-of-range" | "too-many-bets" | "exposure-cap";

interface QuoteContext {
  table: ChainTableRecord | null;
  round: ChainRoundRecord | null;
  existing: ContractBet[];
}

/** Resolves the table and round a bet set would land in. A round that is not Open contributes no existing bets. */
async function quoteContext(reader: ChainReader, body: { table?: string; roundId?: number | string }): Promise<QuoteContext> {
  const tables = body.table != null || body.roundId != null ? await reader.tables() : [];
  let table = body.table != null ? findTable(tables, body.table) : null;
  let round: ChainRoundRecord | null = null;
  if (body.roundId != null) {
    round = await reader.round(BigInt(body.roundId));
    if (!round) throw new ApiFailure("NOT_FOUND", `Unknown round ${body.roundId}: RouletteGame has no round with this id`);
    if (table && round.tableId !== table.id) throw new ApiFailure("VALIDATION_ERROR", `Round ${body.roundId} belongs to table ${round.tableId}, not table ${table.id}`);
    table = table ?? tables.find((t) => t.id === round!.tableId) ?? null;
  } else if (table) {
    const latest = await reader.latestRounds();
    round = latest.rounds.find((r) => r.tableId === table!.id && r.status === ROUND_STATUS.Open) ?? null;
  }
  const existing = round && round.status === ROUND_STATUS.Open && round.betCount > 0 ? (await reader.bets(round.roundId)).map((b) => ({ numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake })) : [];
  return { table, round, existing };
}

/**
 * The pre-acceptance check RouletteGame.placeBets runs, in the same order and integer
 * maths: table stake range, bet count, then RiskEngine.checkWager over the round's whole
 * bet set against (availableBankrollUnits + the round's own reservation) × exposure cap.
 */
async function buildChainQuote(reader: ChainReader, lines: QuoteLine[], bets: ContractBet[], ctx: QuoteContext) {
  const [treasury, game] = await Promise.all([reader.treasury(), reader.game()]);
  const { table, round, existing } = ctx;
  const roundOpen = round?.status === ROUND_STATUS.Open;
  const previousReservation = roundOpen ? round!.reservedUnits : 0n;
  const available = treasury.availableUnits + previousReservation;
  const bps = treasury.raw.maxRoundExposureBps;
  const own = maximumLiabilityUnits(bets);
  const check = checkWagerUnits(available, bps, [...existing, ...bets]);

  let reason: string | null = null;
  let code: QuoteRejection | null = null;
  const reject = (c: QuoteRejection, message: string) => {
    if (code) return;
    code = c;
    reason = message;
  };
  if (gameplayPaused(treasury)) reject("paused", "Gameplay is paused on chain");
  if (table && !table.active) reject("table-inactive", `Table ${table.id} is not active`);
  if (round && !roundOpen) reject("round-not-open", `Round ${round.roundId} is ${roundStatusLabel(round.status)}, not Open`);
  if (table) {
    const out = bets.findIndex((b) => b.stake < table.minStake || b.stake > table.maxStake);
    if (out >= 0) reject("stake-out-of-range", `Stake ${bets[out]!.stake} on ${lines[out]!.betId} is outside the table range ${table.minStake}–${table.maxStake}`);
  }
  if (existing.length + bets.length > game.maxBetsPerRound) reject("too-many-bets", `Round would hold ${existing.length + bets.length} bets; the maximum is ${game.maxBetsPerRound}`);
  if (!check.ok) reject("exposure-cap", "Table limit reached");

  const cap = (m: number) => {
    const treasuryMax = Number(maxSafeStakeUnits(available, m, previousReservation, bps));
    return table ? Math.min(Number(table.maxStake), treasuryMax) : treasuryMax;
  };
  return {
    bets: lines,
    totalWager: Number(bets.reduce((s, b) => s + b.stake, 0n)),
    /** Worst case of the submitted bets on their own. */
    maximumLiability: { worstResult: own.worstResult, maxReturn: Number(own.maxReturn), maxNetPayout: Number(own.maxNetPayout) },
    limit: {
      ok: code === null,
      reason: reason as string | null,
      /** Machine-readable rejection: paused | table-inactive | round-not-open | stake-out-of-range | too-many-bets | exposure-cap. */
      code: code as QuoteRejection | null,
      /** Worst-case net payout of the round's whole bet set after these bets (what the treasury would reserve). */
      maxNetPayout: Number(check.maxNetPayout),
      maxRoundExposure: Number(check.maxRoundExposure),
      availableBankroll: Number(available),
      /** Largest further single-bet stake for a straight-up (35:1) and even-money (1:1) bet, given what the round already reserves. */
      maxStraight: cap(35),
      maxOutside: cap(1),
    },
    table: table ? { id: String(table.id), minBet: Number(table.minStake), maxBet: Number(table.maxStake), status: table.active ? ("live" as const) : ("locked" as const) } : null,
    round: round ? { id: idJson(round.roundId), status: roundStatusLabel(round.status), existingBets: existing.length, reservedUnits: Number(round.reservedUnits) } : null,
    accepted: code === null,
    unit: "chip units",
    source: "RiskEngine.checkWager mirrored over CasinoTreasury.availableBankrollUnits / maxRoundExposureBps and the round's bets on Robinhood Chain",
  };
}

/** Bet ids → quote lines + on-chain structs. Stakes must be whole chip units on chain. */
function resolveChainBets(input: ReadonlyArray<{ betId: string; stake: number }>) {
  const fractional = input.find((b) => !Number.isSafeInteger(b.stake));
  if (fractional) throw new ApiFailure("VALIDATION_ERROR", `Stake ${fractional.stake} on "${fractional.betId}" must be a whole number of chip units (the contracts take uint128 units)`, { betId: fractional.betId });
  const { placed, lines } = resolveBets([...input]);
  let contractBets: ContractBet[];
  try {
    contractBets = placed.map((b) => encodeBet(b, b.stake));
  } catch (e) {
    throw new ApiFailure("VALIDATION_ERROR", e instanceof Error ? e.message : "Invalid bet");
  }
  return { lines, contractBets };
}

export function chainQuote(reader: ChainReader, body: ChainQuoteBody) {
  return chainRoute(async () => {
    const { lines, contractBets } = resolveChainBets(body.bets);
    const ctx = await quoteContext(reader, body);
    return ok(await buildChainQuote(reader, lines, contractBets, ctx), { ...LIVE });
  });
}

/* ---------------------------------------------------------------- intents */

const SIGNING_NOTE = "Unsigned. Sign and broadcast with the wallet that owns `address`; this API holds no key and sends nothing.";

/** The `chips` body field shared by the intents that move wallet chips. */
const chipLotsField = z
  .array(
    z.object({
      denomination: z
        .number()
        .int()
        .refine((d): d is ChipDenomination => (chipDenominations as readonly number[]).includes(d), { message: `Denomination must be one of ${chipDenominations.join(", ")}` }),
      count: z.number().int().positive().max(1_000_000),
    }),
  )
  .min(1)
  .max(6);

/**
 * Picks chips from the caller's on-chain wallet balances: exact `chips` by denomination,
 * `units` greedily largest-first (the web app's selection), or every chip. Fails with
 * INSUFFICIENT_CHIPS when the wallet cannot cover or exactly make the request.
 */
function selectWalletChips(body: { units?: number; chips?: Array<{ denomination: ChipDenomination; count: number }> }, account: AccountState, verb: "escrow" | "convert"): ChipSelection {
  const acct = accountView(account);
  if (body.chips) {
    const merged = new Map<ChipDenomination, number>();
    for (const c of body.chips) merged.set(c.denomination, (merged.get(c.denomination) ?? 0) + c.count);
    const short = [...merged.entries()].find(([d, n]) => BigInt(n) > account.chips[d]);
    if (short) throw new ApiFailure("INSUFFICIENT_CHIPS", `Wallet holds ${account.chips[short[0]]} chips of denomination ${short[0]}, not ${short[1]}.`, { account: acct });
    const entries = [...merged.entries()].sort((x, y) => y[0] - x[0]);
    return { ids: entries.map(([d]) => chipTokenIds[d]), amounts: entries.map(([, n]) => BigInt(n)), units: entries.reduce((s, [d, n]) => s + d * n, 0), exact: true };
  }
  if (body.units != null) {
    const selection = selectChips(account.chips, body.units);
    if (!selection.exact) {
      throw new ApiFailure(
        "INSUFFICIENT_CHIPS",
        body.units > account.chipUnits
          ? `Wallet holds ${account.chipUnits} chip units, not ${body.units}.`
          : `The wallet's chip denominations cannot make exactly ${body.units} units (largest amount at or below it: ${selection.units}). ${selection.units > 0 ? `Ask for ${selection.units}, or omit` : "Omit"} units to ${verb} every chip.`,
        { account: acct, coverableUnits: selection.units },
      );
    }
    return selection;
  }
  return selectAllChips(account.chips);
}

export const ChainEnterTableBodySchema = z
  .object({
    /** Wallet that holds the chips and will sign. */
    address: callerAddress,
    /** Chip units to escrow, picked largest-denomination-first from the wallet (same selection as the web app). Omit to escrow every chip. */
    units: z.number().int().positive().max(1_000_000_000).optional(),
    /** Or name exact chips by denomination. */
    chips: chipLotsField.optional(),
  })
  .refine((b) => !(b.units != null && b.chips != null), { message: "Pass either units or chips, not both" });

export function chainEnterTableIntent(reader: ChainReader, body: z.infer<typeof ChainEnterTableBodySchema>) {
  return chainRoute(async () => {
    requireContracts(reader, ["game", "chip", "treasury"]);
    const [account, treasury] = await Promise.all([reader.account(body.address), reader.treasury()]);
    const acct = accountView(account);
    if (gameplayPaused(treasury)) throw new ApiFailure("PAUSED", "Gameplay is paused on chain; enterTable would revert.", { pause: pauseView(treasury.pause.treasury | (treasury.pause.game ?? 0)) });
    if (account.chipUnits <= 0) {
      throw new ApiFailure("NO_CHIPS", `${body.address} holds no chips in its wallet. Deposit ETH with CasinoTreasury.deposit() first (chips are minted for the payout-liquidity share).`, {
        account: acct,
        deposit: { contract: "CasinoTreasury", to: reader.addresses.treasury, function: "deposit() payable", chipPriceWei: treasury.raw.chipPriceWei.toString() },
      });
    }

    const selection = selectWalletChips(body, account, "escrow");

    const lots: ChipLot[] = selection.ids.map((id, i) => ({ denomination: chipIdToDenomination(id)!, count: Number(selection.amounts[i]) }));
    const addresses = intentAddresses(reader);
    const built = buildEnterTableIntent(lots, addresses);
    if (account.approved) built.intent.warnings = built.intent.warnings.filter((w) => !w.startsWith("Requires a prior Chip1155.setApprovalForAll"));
    const prerequisites = account.approved ? [] : [buildApprovalIntent(addresses)];
    return ok(
      {
        intent: built.intent,
        /** Transactions to sign BEFORE `intent`, in order. Empty when the treasury is already an approved operator. */
        prerequisites,
        units: built.units,
        chips: [...lots].sort((x, y) => y.denomination - x.denomination).map((l) => ({ denomination: l.denomination, tokenId: chipTokenIds[l.denomination].toString(), count: l.count })),
        account: acct,
        preflight: { chipsApproved: account.approved, gameplayPaused: false, escrowAfter: Number(account.escrowUnits) + built.units },
        note: `${prerequisites.length ? "Sign the approval in prerequisites first (once per wallet), then the intent. " : ""}Escrowed units can be withdrawn at any time with leave-table. ${SIGNING_NOTE}`,
      },
      LIVE,
    );
  });
}

export const ChainPlaceBetsBodySchema = z.object({
  address: callerAddress,
  /** Round to bet on. Omit to use the table's current Open round. */
  roundId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,78}$/)]).optional(),
  /** On-chain table id; defaults to the default table. */
  table: z.string().min(1).max(64).optional(),
  bets: z.array(IntentBetInputSchema).min(1).max(64),
});

export function chainPlaceBetsIntent(reader: ChainReader, body: z.infer<typeof ChainPlaceBetsBodySchema>) {
  return chainRoute(async () => {
    requireContracts(reader, ["game", "treasury"]);
    const { lines, contractBets } = resolveChainBets(body.bets);
    const tables = await reader.tables();
    const tableId = body.table ?? String(resolveChainTableId(null));
    let table = body.table != null || body.roundId == null ? findTable(tables, tableId) : null;

    let round: ChainRoundRecord | null;
    if (body.roundId != null) {
      round = await reader.round(BigInt(body.roundId));
      if (!round) throw new ApiFailure("ROUND_NOT_OPEN", `Round ${body.roundId} does not exist on chain.`, { roundId: body.roundId, status: "None" });
      if (table && round.tableId !== table.id) throw new ApiFailure("VALIDATION_ERROR", `Round ${body.roundId} belongs to table ${round.tableId}, not table ${table.id}`);
      table = table ?? tables.find((t) => t.id === round!.tableId) ?? null;
    } else {
      const [latest, treasury] = await Promise.all([reader.latestRounds(), reader.treasury()]);
      round = latest.rounds.find((r) => r.tableId === table!.id) ?? null;
      if (!round || round.status !== ROUND_STATUS.Open) {
        const seated = treasury.escrowUnits > 0n;
        throw new ApiFailure(
          "ROUND_NOT_OPEN",
          round && round.status === ROUND_STATUS.Closed
            ? `Round ${round.roundId} on table ${table!.id} is Closed (betting over, awaiting the reveal). Wait for the next round.`
            : seated
              ? `No round is open on table ${table!.id} right now. Players are seated, so the operator is expected to open the next one shortly; poll GET /api/v1/tables/${table!.id}.`
              : `No round is open on table ${table!.id}. The operator opens rounds only while someone has chips in escrow: enter the table first, then poll GET /api/v1/tables/${table!.id}.`,
          { table: String(table!.id), latestRound: round ? { id: idJson(round.roundId), status: roundStatusLabel(round.status) } : null, operator: seated ? "between-rounds" : "waiting-for-players" },
        );
      }
    }
    if (round.status !== ROUND_STATUS.Open) {
      throw new ApiFailure("ROUND_NOT_OPEN", `Round ${round.roundId} is ${roundStatusLabel(round.status)}, not Open. placeBets would revert.`, { roundId: idJson(round.roundId), status: roundStatusLabel(round.status), table: String(round.tableId) });
    }

    const [account, treasury] = await Promise.all([reader.account(body.address), reader.treasury()]);
    if (gameplayPaused(treasury)) throw new ApiFailure("PAUSED", "Gameplay is paused on chain; placeBets would revert.", { pause: pauseView(treasury.pause.treasury | (treasury.pause.game ?? 0)) });
    const existing = round.betCount > 0 ? (await reader.bets(round.roundId)).map((b) => ({ numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake })) : [];
    const quote = await buildChainQuote(reader, lines, contractBets, { table, round, existing });

    const total = contractBets.reduce((s, b) => s + b.stake, 0n);
    // Same order as the contract: stake range, then escrow, then the round-wide exposure check.
    if (quote.limit.code === "stake-out-of-range") throw new ApiFailure("TABLE_LIMIT", quote.limit.reason ?? "Stake outside the table range", { quote });
    if (total > account.escrowUnits) {
      throw new ApiFailure("INSUFFICIENT_ESCROW", `These bets stake ${total} chip units but ${body.address} has ${account.escrowUnits} in table escrow. Escrow chips with the enter-table intent first.`, {
        required: Number(total),
        account: accountView(account),
      });
    }
    if (!quote.accepted) throw new ApiFailure("TABLE_LIMIT", quote.limit.reason ?? "Rejected by the pre-acceptance check", { quote });

    const summary = lines.map((l) => `${l.label} ${l.stake}`).join(", ");
    const intent = buildPlaceBetsIntent(round.roundId, contractBets, summary, intentAddresses(reader));
    return ok(
      {
        intent,
        quote,
        round: {
          id: idJson(round.roundId),
          table: String(round.tableId),
          status: "Open" as const,
          openedAt: round.openedAt,
          /** Approximate: the betting window is the operator's, not stored on chain. Sign promptly. */
          betsCloseAt: round.openedAt > 0 ? round.openedAt + BETTING_WINDOW_SECONDS : null,
          betsCloseAtApproximate: true as const,
        },
        account: accountView(account),
        maxLiability: quote.maximumLiability.maxNetPayout,
        limitCheck: quote.limit,
        encoding: "IRiskEngine.Bet { uint64 numbersMask (bit i = pocket i), uint16 multiplier, uint128 stake }",
        note: SIGNING_NOTE,
      },
      LIVE,
    );
  });
}

export const ChainLeaveTableBodySchema = z.object({
  address: callerAddress,
  /** Escrowed chip units to mint back to the wallet. Omit to withdraw the whole escrow. */
  units: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,38}$/)]).optional(),
});

export function chainLeaveTableIntent(reader: ChainReader, body: z.infer<typeof ChainLeaveTableBodySchema>) {
  return chainRoute(async () => {
    requireContracts(reader, ["game", "chip", "treasury"]);
    const account = await reader.account(body.address);
    const acct = accountView(account);
    if (account.escrowUnits <= 0n) throw new ApiFailure("INSUFFICIENT_ESCROW", `${body.address} has no chip units in table escrow; there is nothing to withdraw.`, { account: acct });
    const units = body.units != null ? BigInt(body.units) : account.escrowUnits;
    if (units > account.escrowUnits) throw new ApiFailure("INSUFFICIENT_ESCROW", `${body.address} has ${account.escrowUnits} chip units in escrow, not ${units}. leaveTable would revert.`, { requested: units.toString(), account: acct });
    return ok(
      { intent: buildLeaveTableIntent(units, intentAddresses(reader)), units: units.toString(), account: acct, preflight: { escrowAfter: Number(account.escrowUnits - units) }, note: `Stakes in a round that has not settled are not in escrow until it settles. ${SIGNING_NOTE}` },
      LIVE,
    );
  });
}

/* ------------------------------------------------------ collect: convert */

const usdJson = (v: bigint) => Number(formatUnits(v, 18));

/** One reward asset's claim ceiling for a win balance, from the vault's own inventory and fresh price. */
function claimableView(a: RewardAssetState, winBalanceUsd1e18: bigint) {
  const v = a.vault;
  const limit = claimLimit({ winBalanceUsd1e18, inventory: v.inventory, priceUsd1e18: v.priceUsd1e18, decimals: v.decimals, minimumPayoutUsd1e18: v.minimumPayoutUsd, enabled: v.registered && v.enabled });
  const token = rewardRegistry.find((t) => t.contractAddress?.toLowerCase() === a.address.toLowerCase());
  return { symbol: token?.symbol ?? null, contractAddress: a.address, ...maxClaimableView(limit, a) };
}

function maxClaimableView(limit: ClaimLimit, a: RewardAssetState) {
  return {
    /** min(win balance, vault inventory × posted price): the most claimAs would pay right now. */
    maxClaimableUsd: usdJson(limit.maxUsd1e18),
    maxClaimableUsd1e18: limit.maxUsd1e18.toString(),
    /** The same maximum as an exact decimal string: pass it as `usdAmount` to claim everything claimable (the number above may round). */
    maxClaimableUsdAmount: formatUnits(limit.maxUsd1e18, 18),
    limitedBy: limit.limitedBy,
    /** Why nothing is claimable: not-enabled | no-price | no-inventory | no-balance | below-minimum; null when claimable. */
    blocker: limit.blocker,
    inventory: a.vault.inventory.toString(),
    inventoryTokens: Number(formatUnits(a.vault.inventory, a.vault.decimals)),
    /** Vault inventory valued at the fresh posted price; 0 without one. */
    inventoryUsd: usdJson(limit.inventoryUsd1e18),
  };
}

const RESTOCK_NOTE = "Vault inventory is restocked in batches from the treasury's reward buckets (conversions are fulfilled in batches).";

export const ChainConvertToRewardsBodySchema = z
  .object({
    /** Wallet that holds the chips and will sign. */
    address: callerAddress,
    /** Chip units to convert, picked largest-denomination-first from the wallet. Omit (and omit chips) to convert every wallet chip. */
    units: z.number().int().positive().max(1_000_000_000).optional(),
    /** Or name exact chips by denomination. */
    chips: chipLotsField.optional(),
  })
  .strict()
  .refine((b) => !(b.units != null && b.chips != null), { message: "Pass either units or chips, not both" });

/**
 * Step 1 of the reward flow: CasinoTreasury.convertToRewards(ids, amounts). Burns wallet
 * chips and credits units × chipUsdValue to RewardVault.winBalance. One-way. The response
 * says what each reward asset could pay right now, so an agent does not convert into a
 * balance it cannot claim yet without knowing.
 */
export function chainConvertToRewardsIntent(reader: ChainReader, body: z.infer<typeof ChainConvertToRewardsBodySchema>) {
  return chainRoute(async () => {
    requireContracts(reader, ["treasury", "chip", "rewardVault"]);
    const [account, treasury, assets] = await Promise.all([reader.account(body.address), reader.treasury(), reader.rewardAssets()]);
    const acct = accountView(account);
    if (claimsPaused(treasury)) throw new ApiFailure("PAUSED", "Claims are paused on chain (PAUSE_CLAIMS); convertToRewards would revert.", { pause: pauseView(treasury.pause.treasury | (treasury.pause.vault ?? 0)) });
    if (account.chipUnits <= 0) {
      const seated = account.escrowUnits > 0n;
      throw new ApiFailure(
        "NO_CHIPS",
        seated
          ? `${body.address} holds no chips in its wallet; ${account.escrowUnits} chip units are in table escrow. Bring them back with the leave-table intent first: only wallet chips can be converted.`
          : `${body.address} holds no chips in its wallet, so there is nothing to convert.`,
        { account: acct },
      );
    }
    const selection = selectWalletChips(body, account, "convert");
    const lots: ChipLot[] = selection.ids.map((id, i) => ({ denomination: chipIdToDenomination(id)!, count: Number(selection.amounts[i]) }));
    const addresses = intentAddresses(reader);
    const built = buildConvertToRewardsIntent(lots, addresses);
    if (account.approved) built.intent.warnings = built.intent.warnings.filter((w) => !w.startsWith("Requires a prior Chip1155.setApprovalForAll"));
    const prerequisites = account.approved ? [] : [buildApprovalIntent(addresses)];

    const creditUsd1e18 = convertCreditUsd1e18(built.units, treasury.raw.chipUsdValue);
    const winAfter = account.winBalanceUsd1e18 + creditUsd1e18;
    const claimable = assets.filter((a) => a.vault.registered).map((a) => claimableView(a, winAfter));
    const bestUsd1e18 = claimable.reduce((m, c) => (BigInt(c.maxClaimableUsd1e18) > m ? BigInt(c.maxClaimableUsd1e18) : m), 0n);
    const warnings: string[] = [];
    if (bestUsd1e18 === 0n) warnings.push(`No reward asset can be claimed right now: after this conversion the win balance would be $${usdJson(winAfter)} and the vault could pay $0 of it. ${RESTOCK_NOTE} The win balance stays yours until it can be claimed; it cannot be converted back.`);
    else if (bestUsd1e18 < winAfter) warnings.push(`The vault can pay at most $${usdJson(bestUsd1e18)} in a single asset right now, less than the $${usdJson(winAfter)} win balance this conversion would leave. ${RESTOCK_NOTE}`);
    built.intent.warnings.push(...warnings);

    return ok(
      {
        intent: built.intent,
        /** Transactions to sign BEFORE `intent`, in order. Empty when the treasury is already an approved operator. */
        prerequisites,
        units: built.units,
        chips: [...lots].sort((x, y) => y.denomination - x.denomination).map((l) => ({ denomination: l.denomination, tokenId: chipTokenIds[l.denomination].toString(), count: l.count })),
        /** USD credited to the win balance: units × CasinoTreasury.chipUsdValue. */
        credit: { usd: usdJson(creditUsd1e18), usd1e18: creditUsd1e18.toString(), chipUsdValue: usdJson(treasury.raw.chipUsdValue) },
        /** ETH that moves from chip backing to the treasury's `claimable` earmark: units × chipPriceWei. */
        backing: { wei: convertBackingWei(built.units, treasury.raw.chipPriceWei).toString(), chipPriceWei: treasury.raw.chipPriceWei.toString() },
        oneWay: true as const,
        account: acct,
        preflight: { chipsApproved: account.approved, claimsPaused: false, walletChipUnitsAfter: account.chipUnits - built.units, winBalanceUsdAfter: usdJson(winAfter) },
        /** What each registered asset could pay of the resulting win balance right now. */
        claimableAfter: claimable,
        warnings,
        note: `${prerequisites.length ? "Sign the approval in prerequisites first (once per wallet), then the intent. " : ""}One-way: the win balance can only be claimed as reward assets with the claim intent, never withdrawn as ETH (redeem chips for that instead). ${SIGNING_NOTE}`,
      },
      LIVE,
    );
  });
}

export const ChainClaimBodySchema = z
  .object({
    address: callerAddress,
    /** Reward asset: ERC-20 contract address, registry id ("crypto-cashcat") or symbol ("CASHCAT"). */
    asset: z.string().min(1).max(64),
    /** USD of win balance to claim, decimal string or number. Encoded as 1e18 fixed point. */
    usdAmount: z.union([z.number().positive().finite(), z.string().regex(/^\d+(\.\d{1,18})?$/)]),
    /** Slippage tolerance applied to the live vault quote to derive minOut. Default 50 (0.5%), like the web app. */
    slippageBps: z.number().int().min(0).max(5000).default(CLAIM_SLIPPAGE_BPS),
    /** Override minOut (token base units, decimal string) instead of deriving it from the quote. */
    minOut: z.string().regex(/^\d+$/).optional(),
    /** Minutes until the claim expires. Default 10, like the web app. */
    deadlineMinutes: z.number().int().min(1).max(1440).default(CLAIM_DEADLINE_MINUTES),
  })
  .strict();

function resolveRewardAsset(asset: string): { address: Address | null; id: string | null; symbol: string | null } {
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) {
    const t = rewardRegistry.find((x) => x.contractAddress?.toLowerCase() === asset.toLowerCase());
    return { address: asset as Address, id: t?.id ?? null, symbol: t?.symbol ?? null };
  }
  const t = rewardRegistry.find((x) => x.id === asset.toLowerCase() || x.symbol.toLowerCase() === asset.toLowerCase());
  if (!t) throw new ApiFailure("NOT_FOUND", `Unknown reward asset "${asset}". GET /api/v1/rewards lists them.`);
  return { address: (t.contractAddress as Address | null) ?? null, id: t.id, symbol: t.symbol };
}

export function chainClaimIntent(reader: ChainReader, body: z.infer<typeof ChainClaimBodySchema>, nowMs = Date.now()) {
  return chainRoute(async () => {
    requireContracts(reader, ["rewardVault"]);
    const ref = resolveRewardAsset(body.asset);
    const label = ref.symbol ?? ref.address ?? body.asset;
    if (!ref.address) throw new ApiFailure("ASSET_UNAVAILABLE", `${label} is not listed on the reward vault (no contract address); it cannot be claimed.`, { asset: { id: ref.id, symbol: ref.symbol, status: "unverified" } });

    const [assets, head] = await Promise.all([reader.rewardAssets(), reader.head()]);
    const view = rewardsView(assets, head.timestamp).assets.find((a) => a.contractAddress?.toLowerCase() === ref.address!.toLowerCase());
    const state = assets.find((a) => a.address.toLowerCase() === ref.address!.toLowerCase());
    const assetInfo = view ?? { contractAddress: ref.address, registered: false, status: "unavailable" };
    if (!state || !state.vault.registered) throw new ApiFailure("ASSET_UNAVAILABLE", `${label} is not registered on the reward vault.`, { asset: assetInfo });
    if (!state.vault.enabled) throw new ApiFailure("ASSET_UNAVAILABLE", `${label} is registered but not enabled for claims.`, { asset: assetInfo });
    const [account, treasury] = await Promise.all([reader.account(body.address), reader.treasury()]);
    const limit = claimLimit({ winBalanceUsd1e18: account.winBalanceUsd1e18, inventory: state.vault.inventory, priceUsd1e18: state.vault.priceUsd1e18, decimals: state.vault.decimals, minimumPayoutUsd1e18: state.vault.minimumPayoutUsd, enabled: true });
    const maxClaimableNow = maxClaimableView(limit, state);
    // Asset state first (nobody could claim it), then the caller's own balance.
    if (state.vault.priceUsd1e18 == null || state.vault.priceUsd1e18 <= 0n || (state.vault.inventory > 0n && (state.vault.status == null || state.vault.status === 0))) {
      throw new ApiFailure("ASSET_UNAVAILABLE", `${label} is UNAVAILABLE on the reward vault: its oracle price is missing or stale. claimAs would revert.`, { asset: assetInfo, maxClaimableNow });
    }
    if (state.vault.inventory === 0n) {
      throw new ApiFailure("INSUFFICIENT_INVENTORY", `The reward vault holds no ${label} right now, so nothing can be claimed as ${label}. ${RESTOCK_NOTE} The win balance is unchanged; retry later or choose another asset (GET /api/v1/rewards).`, {
        asset: assetInfo,
        available: { inventory: "0", inventoryTokens: 0, usd: 0 },
        maxClaimableNow,
        account: accountView(account),
      });
    }

    const usd1e18 = parseUnits(String(body.usdAmount), 18);
    if (usd1e18 <= 0n) throw new ApiFailure("VALIDATION_ERROR", "usdAmount must be positive");
    if (claimsPaused(treasury)) throw new ApiFailure("PAUSED", "Claims are paused on chain; claimAs would revert.", { pause: pauseView(treasury.pause.treasury | (treasury.pause.vault ?? 0)) });
    if (usd1e18 < state.vault.minimumPayoutUsd) throw new ApiFailure("VALIDATION_ERROR", `usdAmount is below the vault's minimum payout for ${label} ($${Number(state.vault.minimumPayoutUsd) / 1e18}).`, { asset: assetInfo, maxClaimableNow });
    if (usd1e18 > account.winBalanceUsd1e18) {
      throw new ApiFailure("INSUFFICIENT_WIN_BALANCE", `${body.address} has a win balance of $${Number(account.winBalanceUsd1e18) / 1e18}, not $${String(body.usdAmount)}.${account.winBalanceUsd1e18 === 0n ? " Convert chips to a win balance first with the convert-to-rewards intent." : ""}`, { account: accountView(account), maxClaimableNow });
    }

    const quote = await reader.quoteClaim(ref.address, usd1e18);
    if (!quote) throw new ApiFailure("ASSET_UNAVAILABLE", `The vault could not quote ${label}: its oracle price is missing or stale.`, { asset: assetInfo, maxClaimableNow });
    if (quote.amountOut === 0n) throw new ApiFailure("VALIDATION_ERROR", `$${String(body.usdAmount)} buys zero base units of ${label} at the current price.`);
    if (quote.amountOut > state.vault.inventory) {
      throw new ApiFailure(
        "INSUFFICIENT_INVENTORY",
        `The vault holds ${state.vault.inventory} base units of ${label} (worth $${maxClaimableNow.inventoryUsd} at the posted price); this claim needs ${quote.amountOut}. Claim up to $${maxClaimableNow.maxClaimableUsdAmount} now, or choose another asset. ${RESTOCK_NOTE}`,
        {
          asset: assetInfo,
          required: { amountOut: quote.amountOut.toString(), usd: usdJson(usd1e18) },
          available: { inventory: state.vault.inventory.toString(), inventoryTokens: maxClaimableNow.inventoryTokens, usd: maxClaimableNow.inventoryUsd },
          maxClaimableNow,
          account: accountView(account),
        },
      );
    }

    const minOut = body.minOut != null ? BigInt(body.minOut) : withSlippage(quote.amountOut, body.slippageBps);
    const deadline = deadlineIn(body.deadlineMinutes, nowMs);
    const intent = buildClaimIntent(ref.address, usd1e18, minOut, deadline, `$${String(body.usdAmount)}`, intentAddresses(reader));
    return ok(
      {
        intent,
        asset: assetInfo,
        usdAmount1e18: usd1e18.toString(),
        quote: { amountOut: quote.amountOut.toString(), priceUsd1e18: quote.price.toString(), priceUsd: Number(quote.price) / 1e18, decimals: state.vault.decimals },
        minOut: minOut.toString(),
        slippageBps: body.minOut != null ? null : body.slippageBps,
        deadline: deadline.toString(),
        /** The most this wallet could claim of this asset right now: min(win balance, vault inventory × posted price). */
        maxClaimableNow,
        account: accountView(account),
        note: SIGNING_NOTE,
      },
      LIVE,
    );
  });
}
