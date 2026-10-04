/**
 * Dataset catalog in the shape a data marketplace listing wants: one entry per
 * dataset with access path, cadence, field dictionary and licensing notes.
 * Two catalogs: the simulated one (demo mode) and the chain-backed one served when
 * NEXT_PUBLIC_DEMO_MODE=false; `demo` says which per entry.
 */
import { CHAIN_BACKED } from "./mode";

export interface DatasetField {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "hex32" | "address" | "timestamp-ms" | "enum" | "array" | "object";
  description: string;
  enum?: readonly string[];
}

export interface DatasetListing {
  id: string;
  title: string;
  summary: string;
  endpoint: string;
  method: "GET" | "POST";
  /** How often the underlying data changes. */
  refreshCadence: string;
  /** Suggested polling interval for consumers. */
  suggestedPollSeconds: number;
  granularity: string;
  history: string;
  demo: boolean;
  provenance: string;
  license: string;
  fields: readonly DatasetField[];
  pagination?: { style: "cursor"; params: readonly string[] } | null;
  filters?: readonly string[];
  tags: readonly string[];
}

const hex32: DatasetField["type"] = "hex32";

/** Catalog served while the API is on simulated data (demo mode). */
export const demoDatasetCatalog: readonly DatasetListing[] = [
  {
    id: "rounds",
    title: "Settled rounds with fairness proofs",
    summary: "Every settled roulette round with its commitment, revealed seeds, block reference and result. Each row is independently verifiable with POST /api/v1/verify.",
    endpoint: "/api/v1/rounds",
    method: "GET",
    refreshCadence: "Per round (every 20–140 s per live table)",
    suggestedPollSeconds: 15,
    granularity: "One row per round",
    history: "Rolling window of recent rounds (demo: 480 deterministic rounds)",
    demo: true,
    provenance: "Demo: seeded generator; production: RouletteGame.RoundSettled + RandomnessManager reveal events on Robinhood Chain",
    license: "Open for read, attribution appreciated. Beta; schema may change before v1.1.",
    pagination: { style: "cursor", params: ["limit", "cursor"] },
    filters: ["table"],
    tags: ["roulette", "fairness", "commit-reveal", "robinhood-chain", "demo"],
    fields: [
      { name: "roundId", type: "integer", description: "Monotonic round id; part of the hash preimage." },
      { name: "tableId", type: "string", description: "Table identifier." },
      { name: "tableName", type: "string", description: "Display name of the table." },
      { name: "at", type: "timestamp-ms", description: "Settlement time (UTC, unix ms)." },
      { name: "commitment", type: hex32, description: "keccak256(serverSeed), published before bets open." },
      { name: "serverSeed", type: hex32, description: "Revealed after the round closes." },
      { name: "playerSeed", type: hex32, description: "Player-contributed entropy frozen at lock." },
      { name: "blockRef", type: hex32, description: "Block reference fixed at lock." },
      { name: "result", type: "integer", description: "Winning pocket 0..36 = keccak256(serverSeed‖playerSeed‖blockRef‖roundId) mod 37." },
      { name: "color", type: "enum", enum: ["red", "black", "green"], description: "Pocket color." },
      { name: "parity", type: "enum", enum: ["odd", "even", "zero"], description: "Parity of the pocket." },
      { name: "dozen", type: "integer", description: "1..3 or null for zero." },
      { name: "column", type: "integer", description: "1..3 or null for zero." },
      { name: "half", type: "enum", enum: ["low", "high"], description: "1–18 or 19–36, null for zero." },
      { name: "betCount", type: "integer", description: "Number of bets settled in the round." },
      { name: "totalStaked", type: "number", description: "Chip units staked." },
      { name: "totalReturned", type: "number", description: "Chip units returned to players (stakes + profit)." },
      { name: "verified", type: "boolean", description: "Proof re-checked server-side at generation/ingest." },
    ],
  },
  {
    id: "stats",
    title: "Outcome distribution",
    summary: "Descriptive counts (color, parity, dozen, column, half, pocket histogram) over the most recent N rounds. Neutral language only: every spin is independent.",
    endpoint: "/api/v1/stats",
    method: "GET",
    refreshCadence: "Per round",
    suggestedPollSeconds: 30,
    granularity: "Aggregate over a window",
    history: "Window of 1–480 rounds",
    demo: true,
    provenance: "Derived from the rounds dataset",
    license: "Open for read. Not a prediction signal.",
    pagination: null,
    filters: ["table", "window"],
    tags: ["roulette", "statistics", "demo"],
    fields: [
      { name: "window", type: "integer", description: "Requested window size." },
      { name: "sampled", type: "integer", description: "Rounds actually counted." },
      { name: "color", type: "object", description: "{ red, black, green } counts." },
      { name: "parity", type: "object", description: "{ odd, even, zero } counts." },
      { name: "dozen", type: "object", description: "{ 1, 2, 3, zero } counts." },
      { name: "column", type: "object", description: "{ 1, 2, 3, zero } counts." },
      { name: "half", type: "object", description: "{ low, high, zero } counts." },
      { name: "pockets", type: "array", description: "37-element histogram indexed by pocket." },
      { name: "expected", type: "object", description: "Theoretical single-zero probabilities for reference." },
    ],
  },
  {
    id: "treasury",
    title: "Treasury solvency snapshot",
    summary: "Bankroll, reserved liabilities, claimable rewards, protocol and safety reserves, available bankroll, per-round exposure cap and collateralization ratio.",
    endpoint: "/api/v1/treasury",
    method: "GET",
    refreshCadence: "Per deposit, wager, settlement or claim",
    suggestedPollSeconds: 15,
    granularity: "Point-in-time snapshot",
    history: "Current state only (time series planned)",
    demo: true,
    provenance: "Demo: fixed snapshot; production: CasinoTreasury views on Robinhood Chain",
    license: "Open for read.",
    pagination: null,
    tags: ["treasury", "solvency", "risk", "demo"],
    fields: [
      { name: "snapshot.bankroll", type: "number", description: "Assets held for payouts (USD-equivalent)." },
      { name: "snapshot.reservedLiability", type: "number", description: "Worst-case liability of in-flight rounds." },
      { name: "snapshot.claimableRewards", type: "number", description: "Wins recorded but not yet claimed." },
      { name: "snapshot.protocolReserve", type: "number", description: "Operating reserve, never used for payouts." },
      { name: "snapshot.rewardInventoryUsd", type: "number", description: "USD-equivalent held by the RewardVault." },
      { name: "derived.safetyReserve", type: "number", description: "bankroll × safetyReserveBps / 10000." },
      { name: "derived.availableBankroll", type: "number", description: "bankroll − reserved − claimable − protocolReserve − safetyReserve." },
      { name: "derived.maxRoundExposure", type: "number", description: "availableBankroll × maxRoundExposureBps / 10000." },
      { name: "derived.collateralizationPct", type: "number", description: "totalAssets ÷ (reserved + claimable) × 100, capped at 999." },
      { name: "derived.maxStraightStake", type: "number", description: "Largest 35:1 stake accepted right now." },
      { name: "derived.maxOutsideStake", type: "number", description: "Largest 1:1 stake accepted right now." },
      { name: "config.*", type: "object", description: "Active bps parameters and deposit split." },
    ],
  },
  {
    id: "tables",
    title: "Tables and effective limits",
    summary: "Open, starting and locked tables with seated players, speed and effective per-bet limits (min of the table maximum and the treasury-derived maximum per multiplier).",
    endpoint: "/api/v1/tables",
    method: "GET",
    refreshCadence: "On table state change",
    suggestedPollSeconds: 10,
    granularity: "One row per table",
    history: "Current state only",
    demo: true,
    provenance: "Demo tables; production: RouletteGame.tables + treasury snapshot",
    license: "Open for read.",
    pagination: null,
    tags: ["tables", "limits", "demo"],
    fields: [
      { name: "id", type: "string", description: "Table id used by other endpoints." },
      { name: "status", type: "enum", enum: ["live", "locked", "starting"], description: "Table state." },
      { name: "limits.minBet", type: "number", description: "Table minimum stake (chip units)." },
      { name: "limits.maxBet", type: "number", description: "Table maximum stake (chip units)." },
      { name: "limits.maxOutside", type: "number", description: "Effective cap for even-money bets right now." },
      { name: "limits.maxStraight", type: "number", description: "Effective cap for 35:1 bets right now." },
      { name: "recent", type: "array", description: "Most recent results, newest first." },
    ],
  },
  {
    id: "rewards",
    title: "Reward inventory",
    summary: "Reward asset registry (crypto and supported Stock Tokens) with vault inventory, minimum payout and liquidity status.",
    endpoint: "/api/v1/rewards",
    method: "GET",
    refreshCadence: "On inventory funding, claim or oracle update",
    suggestedPollSeconds: 60,
    granularity: "One row per asset",
    history: "Current state only",
    demo: true,
    provenance: "Demo inventory; production: RewardVault.inventory + IPriceOracle",
    license: "Open for read. Stock Token availability is jurisdiction-gated.",
    pagination: null,
    tags: ["rewards", "stock-tokens", "inventory", "demo"],
    fields: [
      { name: "id", type: "string", description: "Registry id, e.g. crypto-eth, stock-nvda." },
      { name: "symbol", type: "string", description: "Ticker symbol." },
      { name: "category", type: "enum", enum: ["stock-token", "crypto", "special"], description: "Asset class." },
      { name: "contractAddress", type: "address", description: "Verified contract address or null." },
      { name: "inventoryUsd", type: "number", description: "USD-equivalent inventory in the vault." },
      { name: "minimumPayoutUsd", type: "number", description: "Smallest claim the vault accepts." },
      { name: "status", type: "enum", enum: ["available", "low", "unavailable", "unverified"], description: "Liquidity status." },
    ],
  },
  {
    id: "fairness-proofs",
    title: "Fairness proof verification",
    summary: "Stateless recomputation of commitment and result for any round tuple. Useful for auditors and agents that re-verify every round they observe.",
    endpoint: "/api/v1/verify",
    method: "POST",
    refreshCadence: "On demand (POST)",
    suggestedPollSeconds: 0,
    granularity: "One proof per call",
    history: "Stateless",
    demo: false,
    provenance: "Pure keccak256 math; identical to lib/fairness/commit-reveal.ts and RandomnessManager.sol",
    license: "Open.",
    pagination: null,
    tags: ["fairness", "verification", "keccak256"],
    fields: [
      { name: "commitOk", type: "boolean", description: "keccak256(serverSeed) equals the commitment." },
      { name: "derivedResult", type: "integer", description: "Recomputed pocket 0..36." },
      { name: "resultOk", type: "boolean", description: "Supplied result equals derivedResult (null when no result was supplied)." },
      { name: "verified", type: "boolean", description: "commitOk and resultOk." },
    ],
  },
];

/* ------------------------------------------------------------ chain-backed */

const OPEN = "Open for read, attribution appreciated. Beta; schema may change before v1.1.";

/**
 * Catalog served when the API reads Robinhood Chain. Only datasets the chain can
 * support are listed, and each says exactly which contract views or logs it comes from.
 * Simulated-only fields (table names, player and spectator counts, speeds) are gone.
 */
export const chainDatasetCatalog: readonly DatasetListing[] = [
  {
    id: "rounds",
    title: "Settled rounds with fairness proofs",
    summary: "Rounds settled on chain with commitment, revealed seeds, block reference and result. Each row is independently verifiable with POST /api/v1/verify; any round id can also be read directly at /api/v1/rounds/{id}.",
    endpoint: "/api/v1/rounds",
    method: "GET",
    refreshCadence: "Per settled round (the operator opens rounds only while a player is seated)",
    suggestedPollSeconds: 30,
    granularity: "One row per round",
    history: "RoundSettled logs inside the scanned block window reported as scanWindow (default about 100 minutes of blocks); not all-time",
    demo: false,
    provenance: "RouletteGame.RoundSettled logs + RouletteGame.getRound + RandomnessManager.getRound on Robinhood Chain",
    license: OPEN,
    pagination: { style: "cursor", params: ["limit", "cursor"] },
    filters: ["table"],
    tags: ["roulette", "fairness", "commit-reveal", "robinhood-chain", "onchain"],
    fields: [
      { name: "roundId", type: "integer", description: "On-chain round id (uint256; a decimal string beyond 2^53). Part of the hash preimage." },
      { name: "tableId", type: "string", description: "On-chain table id, e.g. \"1\"." },
      { name: "status", type: "enum", enum: ["Open", "Closed", "Settled", "Voided"], description: "RouletteGame round status." },
      { name: "openedAt", type: "integer", description: "Block timestamp of openRound, unix seconds." },
      { name: "commitment", type: hex32, description: "keccak256(serverSeed), committed before the round opened." },
      { name: "serverSeed", type: hex32, description: "Revealed after the round closes; null before." },
      { name: "playerSeed", type: hex32, description: "Player entropy frozen at close; null while open." },
      { name: "blockRef", type: hex32, description: "Block hash fixed at reveal; null before." },
      { name: "result", type: "integer", description: "Winning pocket 0..36 = keccak256(serverSeed‖playerSeed‖blockRef‖roundId) mod 37; null unless Settled." },
      { name: "color", type: "enum", enum: ["red", "black", "green"], description: "Pocket color." },
      { name: "betCount", type: "integer", description: "Bets stored on chain for the round." },
      { name: "totalStaked", type: "integer", description: "Chip units staked." },
      { name: "totalReturned", type: "integer", description: "Chip units returned to players (stakes + profit)." },
      { name: "verified", type: "boolean", description: "Seeds re-checked server-side against the commitment and result; null until revealed." },
    ],
  },
  {
    id: "stats",
    title: "Outcome distribution",
    summary: "Descriptive counts (color, parity, dozen, column, half, pocket histogram) and chip units staked/returned over rounds settled on chain inside the scanned block window. Neutral language only: every spin is independent.",
    endpoint: "/api/v1/stats",
    method: "GET",
    refreshCadence: "Per settled round",
    suggestedPollSeconds: 30,
    granularity: "Aggregate over a window",
    history: "Up to `window` most recent settled rounds inside blockWindow",
    demo: false,
    provenance: "RouletteGame.RoundSettled logs on Robinhood Chain",
    license: "Open for read. Not a prediction signal.",
    pagination: null,
    filters: ["table", "window"],
    tags: ["roulette", "statistics", "onchain"],
    fields: [
      { name: "sampled", type: "integer", description: "Settled rounds actually counted." },
      { name: "totalStaked", type: "integer", description: "Chip units staked across the sampled rounds." },
      { name: "totalReturned", type: "integer", description: "Chip units returned across the sampled rounds." },
      { name: "blockWindow", type: "object", description: "{ fromBlock, toBlock, blocks, approxMinutes } the counts cover." },
      { name: "color", type: "object", description: "{ red, black, green } counts." },
      { name: "pockets", type: "array", description: "37-element histogram indexed by pocket." },
      { name: "expected", type: "object", description: "Theoretical single-zero probabilities for reference." },
    ],
  },
  {
    id: "treasury",
    title: "Treasury solvency snapshot",
    summary: "Bankroll, reserved liabilities, claimable rewards, protocol and safety reserves, available bankroll, per-round exposure cap and collateralization, in chip units with wei and peg-derived USD alongside.",
    endpoint: "/api/v1/treasury",
    method: "GET",
    refreshCadence: "Per deposit, wager, settlement or claim",
    suggestedPollSeconds: 10,
    granularity: "Point-in-time snapshot",
    history: "Current state only",
    demo: false,
    provenance: "CasinoTreasury views (bankroll, reservedLiability, claimable, protocolReserve, safetyReserve, availableBankrollUnits, isSolvent) + RouletteGame.maxStakeFor on Robinhood Chain",
    license: "Open for read.",
    pagination: null,
    tags: ["treasury", "solvency", "risk", "onchain"],
    fields: [
      { name: "snapshot.bankroll", type: "integer", description: "Assets held for payouts (chip units)." },
      { name: "snapshot.reservedLiability", type: "integer", description: "Worst-case liability of in-flight rounds (chip units)." },
      { name: "snapshot.escrow", type: "integer", description: "Chip units players hold in table escrow; 0 means nobody is seated." },
      { name: "derived.availableBankroll", type: "integer", description: "bankroll − reserved − claimable − protocolReserve − safetyReserve." },
      { name: "derived.maxRoundExposure", type: "integer", description: "floor(availableBankroll × maxRoundExposureBps / 10000)." },
      { name: "derived.maxStraightStake", type: "integer", description: "Largest 35:1 stake accepted on an empty round right now." },
      { name: "derived.isSolvent", type: "boolean", description: "CasinoTreasury.isSolvent()." },
      { name: "usdAtPeg.*", type: "object", description: "The same buckets in USD at the chip peg (no ETH/USD price exists on chain)." },
      { name: "wei.*", type: "object", description: "Raw wei buckets as decimal strings." },
    ],
  },
  {
    id: "tables",
    title: "Tables, limits and the current round",
    summary: "Every on-chain table with its stake range, treasury-backed effective limits, the round in flight (or null) and what the round operator is waiting for.",
    endpoint: "/api/v1/tables",
    method: "GET",
    refreshCadence: "Per round transition",
    suggestedPollSeconds: 4,
    granularity: "One row per table",
    history: "Current state; `recent` lists results settled inside the scanned block window",
    demo: false,
    provenance: "RouletteGame.tables / maxStakeFor / getRound + RoundOpened logs on Robinhood Chain",
    license: "Open for read.",
    pagination: null,
    tags: ["tables", "limits", "onchain"],
    fields: [
      { name: "id", type: "string", description: "On-chain table id as a string, e.g. \"1\"." },
      { name: "status", type: "enum", enum: ["live", "locked"], description: "locked when inactive, paused or the treasury cannot back a bet." },
      { name: "limits.minBet", type: "integer", description: "Table minimum stake (chip units)." },
      { name: "limits.maxBet", type: "integer", description: "Table maximum stake (chip units)." },
      { name: "limits.maxOutside", type: "integer", description: "Effective cap for even-money bets right now." },
      { name: "limits.maxStraight", type: "integer", description: "Effective cap for 35:1 bets right now." },
      { name: "currentRound", type: "object", description: "{ id, status, openedAt, betCount, totalStaked, betsCloseAt (approximate) } or null when no round is in flight." },
      { name: "operator", type: "enum", enum: ["round-open", "awaiting-reveal", "between-rounds", "waiting-for-players"], description: "What the round operator is doing, inferred from chain state." },
      { name: "recent", type: "array", description: "Most recent settled results for the table, newest first." },
    ],
  },
  {
    id: "rewards",
    title: "Reward vault inventory",
    summary: "Assets registered on the reward vault with on-chain status, inventory in token units, the posted oracle price and its age. Registry entries the vault does not hold are listed as not yet listed.",
    endpoint: "/api/v1/rewards",
    method: "GET",
    refreshCadence: "On inventory funding, claim or oracle post (about every 5 minutes)",
    suggestedPollSeconds: 30,
    granularity: "One row per asset",
    history: "Current state only",
    demo: false,
    provenance: "RewardVault.assets / assetConfig / status / inventory / quote + PostedPriceOracle.getPrice on Robinhood Chain",
    license: "Open for read. Stock Token availability is jurisdiction-gated.",
    pagination: null,
    tags: ["rewards", "stock-tokens", "inventory", "onchain"],
    fields: [
      { name: "id", type: "string", description: "Registry id, e.g. crypto-cashcat." },
      { name: "symbol", type: "string", description: "Ticker symbol." },
      { name: "contractAddress", type: "address", description: "Token contract, or null when not listed." },
      { name: "vaultStatus", type: "enum", enum: ["AVAILABLE", "LOW", "UNAVAILABLE"], description: "RewardVault.status for the asset." },
      { name: "inventory", type: "string", description: "Vault inventory in token base units." },
      { name: "priceUsd", type: "number", description: "Fresh oracle price a claim would use; null when unset or stale." },
      { name: "priceAgeSeconds", type: "integer", description: "Age of the posted price." },
      { name: "priceStale", type: "boolean", description: "True when older than the asset's maxStalenessSeconds." },
      { name: "minimumPayoutUsd", type: "number", description: "Smallest claim the vault accepts." },
    ],
  },
  {
    id: "prices",
    title: "Posted oracle prices",
    summary: "The USD price last posted to the on-chain oracle for every asset registered on the reward vault, with its timestamp, age and a staleness flag. No off-chain price feed is consulted.",
    endpoint: "/api/v1/prices",
    method: "GET",
    refreshCadence: "Per oracle post (about every 5 minutes)",
    suggestedPollSeconds: 60,
    granularity: "One row per asset",
    history: "Latest posted price only",
    demo: false,
    provenance: "PostedPriceOracle.getPrice + RewardVault.assetConfig.maxStaleness on Robinhood Chain",
    license: "Open for read.",
    pagination: null,
    tags: ["prices", "oracle", "onchain"],
    fields: [
      { name: "symbol", type: "string", description: "Ticker symbol." },
      { name: "contractAddress", type: "address", description: "Token contract." },
      { name: "priceUsd", type: "number", description: "USD per whole token as posted." },
      { name: "updatedAt", type: "integer", description: "Unix seconds of the post." },
      { name: "ageSeconds", type: "integer", description: "Chain time minus updatedAt." },
      { name: "stale", type: "boolean", description: "True when the vault would reject a claim on this price." },
    ],
  },
  demoDatasetCatalog.find((d) => d.id === "fairness-proofs")!,
];

export const datasetCatalog: readonly DatasetListing[] = CHAIN_BACKED ? chainDatasetCatalog : demoDatasetCatalog;
