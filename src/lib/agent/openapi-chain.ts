import { activeChain } from "@/config/chains";
import { siteConfig } from "@/config/site";
import { API_VERSION, ERROR_CODES } from "./envelope";
import { FUNCTION_SIGNATURES } from "./intents";
import { address, errorResponse, hex32, ref, type Schema } from "./openapi-demo";
import type { OpenApiDocument } from "./openapi";

/**
 * OpenAPI 3.1 document for the chain-backed API (NEXT_PUBLIC_DEMO_MODE=false). Every
 * shape here is what src/lib/agent/chain-api.ts returns from Robinhood Chain reads;
 * the `openapi.test.ts` suite checks paths, refs and the error-code enum.
 */
const envelope = (dataSchema: Schema, description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["ok", "demo", "data"],
        properties: { ok: { const: true }, demo: { const: false, description: "Always false: the response was read from Robinhood Chain." }, data: dataSchema },
      },
    },
  },
});

const chainError = errorResponse("CHAIN_UNAVAILABLE: Robinhood Chain could not be read. Nothing is simulated in its place; honour Retry-After.");
const notConfigured = "CONTRACTS_NOT_DEPLOYED: a contract this route needs has no address configured";
const readErrors = { "503": chainError };
const standardErrors = {
  "400": errorResponse("BAD_REQUEST (malformed JSON) or VALIDATION_ERROR (details list the failing fields)"),
  "404": errorResponse("NOT_FOUND"),
  "429": errorResponse("RATE_LIMITED (POST routes only); Retry-After header set"),
  "503": chainError,
};
const intentResponses = (dataName: string, conflict: string) => ({
  "200": envelope(ref(dataName), "Unsigned transaction intent with the preflight it was checked against. Sign with the wallet that owns `address`."),
  "409": errorResponse(`${conflict}; ${notConfigured}. No intent and no preview is returned when a precondition fails.`),
  ...standardErrors,
});

const units: Schema = { type: "integer", description: "Whole chip units. One unit costs CasinoTreasury.chipPriceWei and is pegged to chipUsdValue (USD 0.10 at launch)." };
const roundId: Schema = { oneOf: [{ type: "integer", minimum: 0 }, { type: "string", pattern: "^\\d{1,78}$" }], description: "uint256 round id: a JSON integer, or a decimal string beyond 2^53." };
const tableId: Schema = { type: "string", pattern: "^[1-9]\\d*$", description: "On-chain table id as a decimal string.", examples: ["1"] };
const nullable = (s: Schema): Schema => ({ oneOf: [s, { type: "null" }] });
const callerAddress: Schema = { ...address, description: "The caller's wallet: all-lowercase or EIP-55 checksummed (a mixed-case address with a wrong checksum is rejected). Used only for read-only preflight; the API never signs.", examples: ["0x1c01912b96BA6783ae8c3c1D8e135Ee185079aa5"] };
const EXAMPLE_ADDRESS = "0x1c01912b96BA6783ae8c3c1D8e135Ee185079aa5";

export const chainOpenapiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: `${siteConfig.name} API`,
    version: API_VERSION,
    summary: "Agent-ready read, verify, quote and unsigned-intent interface for onchain roulette on Robinhood Chain.",
    description: [
      "Machine interface for AI agents and integrations. Reads are public and cacheable; the five `intents` routes return UNSIGNED transactions that the agent's own wallet must sign.",
      "This API never holds keys and never signs. Agents are bound by the same age, jurisdiction and responsible-play gates as human players, and every wager is limited by treasury collateral before acceptance.",
      "Chain-backed: every route reads the deployed contracts on Robinhood Chain through a server-side cache of a few seconds, and every response carries `demo: false`. When the chain cannot be read the answer is `CHAIN_UNAVAILABLE` (503), never substitute data. Amounts are whole chip units; USD figures are derived from the treasury's chip peg and labelled `usdAtPeg`, because there is no ETH/USD price on chain.",
      "Rounds are opened by an operator only while a player has chips in table escrow, so `currentRound: null` with `operator: \"waiting-for-players\"` is a normal state. The betting window (about 45 s) is the operator's and is not stored on chain: `betsCloseAt` is approximate.",
      "End to end: GET /tables → POST /quote → POST /intents/enter-table (sign) → poll /tables/{id} until a round is Open → POST /intents/place-bets (sign) → GET /rounds/{id} and POST /verify → POST /intents/leave-table (sign).",
      "Rewards are two steps. POST /intents/convert-to-rewards (sign) burns wallet chips and credits their USD value at the chip peg to a win balance on the RewardVault; this is one-way (a win balance is never withdrawable as ETH: redeem chips for that). POST /intents/claim (sign) then pays the win balance as a reward asset from the vault's own inventory at the posted price. The most that can be claimed at any moment is min(win balance, vault inventory × price), returned as `maxClaimableNow`; inventory is restocked in batches, so `INSUFFICIENT_INVENTORY` means wait or choose another asset, not that the balance is lost.",
      "Independent product built on Robinhood Chain. Not affiliated with, endorsed by or operated by Robinhood. Contracts are not yet audited.",
    ].join("\n\n"),
    contact: { url: "/developers" },
    "x-agent-ready": true,
    "x-signing": "never",
    "x-network": "Robinhood Chain",
    "x-chain-id": activeChain.id,
  },
  servers: [{ url: "/api/v1", description: "Same origin" }],
  tags: [
    { name: "read", description: "Public reads from chain (GET, cacheable for a few seconds, CORS *)" },
    { name: "fairness", description: "Commit–reveal verification" },
    { name: "quote", description: "Pre-acceptance limit check, mirroring RiskEngine.checkWager" },
    { name: "intents", description: "Unsigned transaction intents with on-chain preflight (never signed here)" },
    { name: "meta", description: "Discovery" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["meta"],
        operationId: "getHealth",
        summary: "Chain id and latest block, configured contracts, pause flags, treasury solvency and operator liveness signals",
        description: "Always answers 200. `status` is `degraded` and `chain.reachable` false when the RPC cannot be reached.",
        responses: { "200": envelope(ref("Health"), "OK") },
      },
    },
    "/openapi.json": {
      get: { tags: ["meta"], operationId: "getOpenApi", summary: "This document", responses: { "200": { description: "OpenAPI 3.1 JSON" } } },
    },
    "/datasets": {
      get: {
        tags: ["meta"],
        operationId: "listDatasets",
        summary: "Dataset catalog with field dictionaries, on-chain provenance and refresh cadence",
        responses: { "200": envelope({ type: "object", properties: { datasets: { type: "array", items: ref("Dataset") } } }, "OK") },
      },
    },
    "/tables": {
      get: {
        tags: ["read"],
        operationId: "listTables",
        summary: "On-chain tables with effective limits and the round in flight",
        responses: { "200": envelope({ type: "object", properties: { tables: { type: "array", items: ref("Table") }, count: { type: "integer" }, unit: { type: "string" }, scanWindow: ref("ScanWindow"), source: { type: "string" } } }, "OK"), ...readErrors },
      },
    },
    "/tables/{id}": {
      get: {
        tags: ["read"],
        operationId: "getTable",
        summary: "One table by its on-chain id",
        description: "Ids are numeric strings. Names from the earlier simulated API (for example `neon-01`) do not exist on chain and return NOT_FOUND.",
        parameters: [{ name: "id", in: "path", required: true, schema: tableId, example: "1" }],
        responses: { "200": envelope({ type: "object", properties: { table: ref("Table"), unit: { type: "string" }, scanWindow: ref("ScanWindow") } }, "OK"), "404": standardErrors["404"], ...readErrors },
      },
    },
    "/treasury": {
      get: { tags: ["read"], operationId: "getTreasury", summary: "Treasury buckets, available bankroll, exposure cap and solvency, read from CasinoTreasury", responses: { "200": envelope(ref("Treasury"), "OK"), ...readErrors } },
    },
    "/limits": {
      get: {
        tags: ["read"],
        operationId: "getLimits",
        summary: "Maximum safe stake for a payout multiplier (RiskEngine.maxSafeStake over the live treasury)",
        parameters: [
          { name: "multiplier", in: "query", schema: { type: "integer", minimum: 1, maximum: 65535, default: 35 }, description: "Profit multiplier: 35 straight, 17 split, 11 street, 8 corner, 5 six-line, 2 dozen/column, 1 even-money." },
          { name: "existingLiability", in: "query", schema: { type: "integer", minimum: 0, default: 0 }, description: "Net liability the round already reserves, whole chip units." },
        ],
        responses: { "200": envelope(ref("Limits"), "OK"), "400": standardErrors["400"], ...readErrors },
      },
    },
    "/rewards": {
      get: { tags: ["read"], operationId: "listRewards", summary: "Reward vault assets: on-chain status, inventory in token units, posted price and its age", responses: { "200": envelope(ref("Rewards"), "OK"), ...readErrors } },
    },
    "/prices": {
      get: {
        tags: ["read"],
        operationId: "listPrices",
        summary: "Prices posted to the on-chain oracle for assets registered on the reward vault (no off-chain feed is consulted)",
        responses: { "200": envelope({ type: "array", items: ref("Price") }, "OK"), ...readErrors },
      },
    },
    "/rounds": {
      get: {
        tags: ["read", "fairness"],
        operationId: "listRounds",
        summary: "Rounds settled inside the scanned block window, newest first, with fairness proofs",
        description: "Built from RoundSettled logs over `scanWindow` (about 100 minutes of blocks by default), so an empty list is normal on a quiet table. Any round id, however old, is readable at /rounds/{id}.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "cursor", in: "query", schema: { type: "string", pattern: "^\\d+$" }, description: "Return rounds with roundId strictly below this value (use nextCursor)." },
          { name: "table", in: "query", schema: tableId },
        ],
        responses: {
          "200": envelope(
            { type: "object", properties: { rounds: { type: "array", items: ref("Round") }, nextCursor: nullable(roundId), total: { type: "integer", description: "Settled rounds inside scanWindow, not all-time." }, scanWindow: ref("ScanWindow"), note: { type: "string" }, proof: { type: "string" }, unit: { type: "string" } } },
            "OK",
          ),
          ...standardErrors,
        },
      },
    },
    "/rounds/{id}": {
      get: {
        tags: ["read", "fairness"],
        operationId: "getRound",
        summary: "One round by id with its bets and a ready-to-send verify body",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^\\d{1,78}$" }, example: "109" }],
        responses: {
          "200": envelope(
            {
              type: "object",
              properties: {
                round: ref("Round"),
                bets: { type: "array", items: ref("Bet") },
                verify: nullable({ type: "object", properties: { endpoint: { type: "string" }, body: ref("VerifyRequest") } }),
                proof: { type: "string" },
                unit: { type: "string" },
                source: { type: "string" },
              },
            },
            "OK. `verify` is null until the seeds are revealed.",
          ),
          ...standardErrors,
        },
      },
    },
    "/stats": {
      get: {
        tags: ["read"],
        operationId: "getStats",
        summary: "Outcome counts and chip units staked/returned over rounds settled inside the scanned block window (descriptive only; spins are independent)",
        parameters: [
          { name: "table", in: "query", schema: tableId },
          { name: "window", in: "query", schema: { type: "integer", minimum: 1, maximum: 480, default: 100 }, description: "Most recent settled rounds to count, at most those inside blockWindow." },
        ],
        responses: { "200": envelope(ref("Stats"), "OK"), ...standardErrors },
      },
    },
    "/verify": {
      post: {
        tags: ["fairness"],
        operationId: "verifyRound",
        summary: "Recompute commitment and result for a round tuple (pure maths; no chain read)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: ref("VerifyRequest"),
              example: {
                roundId: 109,
                commitment: "0x6ea6fc55d885afec1cfbc41d87f693c4e1c768a7ee09cf199efb9e25745ae45c",
                serverSeed: "0x91b701c33dc38befce7989e337e8e137e51575ea1d4bd25f1536df829d017b81",
                playerSeed: "0x204e406319ccc83f0146d1281914afe94070788bfe2fec3d4506a5a5e784303f",
                blockRef: "0x952b9c16e89f70b33bb13ad8d9f0de58f076733cef6ae08e311af44f092642de",
                result: 28,
              },
            },
          },
        },
        responses: { "200": envelope(ref("VerifyResult"), "OK"), "400": standardErrors["400"], "429": standardErrors["429"] },
      },
    },
    "/quote": {
      post: {
        tags: ["quote"],
        operationId: "quoteBets",
        summary: "Validate bets and run the check RouletteGame.placeBets runs, against the live treasury and the round's existing bets",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("QuoteRequest"), example: { bets: [{ betId: "red", stake: 10 }, { betId: "straight:17", stake: 1 }], table: "1" } } },
        },
        responses: { "200": envelope(ref("Quote"), "Quote (check `accepted`; a rejected set still returns 200 with `limit.reason` and `limit.code`)"), ...standardErrors },
      },
    },
    "/intents/enter-table": {
      post: {
        tags: ["intents"],
        operationId: "buildEnterTableIntent",
        summary: `Unsigned RouletteGame.${FUNCTION_SIGNATURES.enterTable}, with chips selected from the caller's wallet and the Chip1155 approval first when it is missing`,
        requestBody: { required: true, content: { "application/json": { schema: ref("EnterTableRequest"), example: { address: EXAMPLE_ADDRESS, units: 50 } } } },
        responses: intentResponses("EnterTableIntent", "NO_CHIPS (wallet holds no chips), INSUFFICIENT_CHIPS (cannot cover or exactly make the requested units), PAUSED"),
      },
    },
    "/intents/place-bets": {
      post: {
        tags: ["intents"],
        operationId: "buildPlaceBetsIntent",
        summary: `Unsigned RouletteGame.${FUNCTION_SIGNATURES.placeBets}; the round must be Open on chain, the stake within the caller's escrow and the set within the treasury limit`,
        requestBody: { required: true, content: { "application/json": { schema: ref("PlaceBetsRequest"), example: { address: EXAMPLE_ADDRESS, table: "1", bets: [{ betId: "red", stake: 5 }] } } } },
        responses: intentResponses("PlaceBetsIntent", "ROUND_NOT_OPEN (no round is open, or the given round is not Open), INSUFFICIENT_ESCROW (stake exceeds the caller's table escrow), TABLE_LIMIT (details.quote explains), PAUSED"),
      },
    },
    "/intents/leave-table": {
      post: {
        tags: ["intents"],
        operationId: "buildLeaveTableIntent",
        summary: `Unsigned RouletteGame.${FUNCTION_SIGNATURES.leaveTable}, at most the caller's escrow`,
        requestBody: { required: true, content: { "application/json": { schema: ref("LeaveTableRequest"), example: { address: EXAMPLE_ADDRESS, units: 25 } } } },
        responses: intentResponses("LeaveTableIntent", "INSUFFICIENT_ESCROW (nothing in escrow, or less than requested)"),
      },
    },
    "/intents/convert-to-rewards": {
      post: {
        tags: ["intents"],
        operationId: "buildConvertToRewardsIntent",
        summary: `Unsigned CasinoTreasury.${FUNCTION_SIGNATURES.convertToRewards}: burns wallet chips and credits their USD value at the chip peg to the caller's win balance (one-way), with the Chip1155 approval first when it is missing`,
        requestBody: { required: true, content: { "application/json": { schema: ref("ConvertToRewardsRequest"), example: { address: EXAMPLE_ADDRESS, units: 50 } } } },
        responses: intentResponses("ConvertToRewardsIntent", "NO_CHIPS (wallet holds no chips; chips in table escrow must leave the table first), INSUFFICIENT_CHIPS (cannot cover or exactly make the requested units), PAUSED (PAUSE_CLAIMS)"),
      },
    },
    "/intents/claim": {
      post: {
        tags: ["intents"],
        operationId: "buildClaimIntent",
        summary: `Unsigned RewardVault.${FUNCTION_SIGNATURES.claimAs} with minOut from the live vault quote and a deadline; returns the maximum claimable now`,
        requestBody: { required: true, content: { "application/json": { schema: ref("ClaimRequest"), example: { address: EXAMPLE_ADDRESS, asset: "CASHCAT", usdAmount: "1.50" } } } },
        responses: intentResponses("ClaimIntent", "ASSET_UNAVAILABLE (not listed, not registered, not enabled, or no fresh price), INSUFFICIENT_INVENTORY (the vault holds none of the asset, or less than the claim needs; details.available and details.maxClaimableNow say how much it can pay), INSUFFICIENT_WIN_BALANCE, PAUSED"),
      },
    },
  },
  components: {
    schemas: {
      ErrorEnvelope: {
        type: "object",
        required: ["ok", "demo", "error"],
        properties: {
          ok: { const: false },
          demo: { const: false },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                enum: [...ERROR_CODES],
                description:
                  "ROUND_NOT_OPEN, INSUFFICIENT_ESCROW, NO_CHIPS, INSUFFICIENT_CHIPS, ASSET_UNAVAILABLE, INSUFFICIENT_WIN_BALANCE, INSUFFICIENT_INVENTORY, PAUSED and TABLE_LIMIT are 409: the chain was read and a precondition is not met. CHAIN_UNAVAILABLE is 503: the chain could not be read. CONTRACTS_NOT_DEPLOYED is 409: an address is not configured.",
              },
              message: { type: "string", description: "Human-readable and specific; safe to show to a user." },
              details: { description: "Structured context: the caller's account, the quote, the asset state." },
            },
          },
        },
      },
      Block: {
        type: "object",
        properties: {
          blockNumber: { type: "integer", description: "L2 block number." },
          l1BlockNumber: { type: ["integer", "null"], description: "Ethereum L1 block number, which the contracts see as block.number." },
          timestamp: { type: "integer", description: "Unix seconds." },
        },
      },
      ScanWindow: {
        type: "object",
        description: "The L2 block range an event-log based answer covers.",
        properties: { fromBlock: { type: "integer" }, toBlock: { type: "integer" }, blocks: { type: "integer" }, approxMinutes: { type: "integer", description: "At roughly 10 L2 blocks per second." } },
      },
      PauseFlags: {
        type: ["object", "null"],
        properties: { flags: { type: "integer" }, deposits: { type: "boolean" }, gameplay: { type: "boolean" }, claims: { type: "boolean" }, withdrawals: { type: "boolean" } },
      },
      Health: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "degraded"] },
          version: { type: "string" },
          product: { type: "string" },
          network: { const: "Robinhood Chain" },
          demoMode: { const: false },
          contractsDeployed: { type: "boolean" },
          contracts: { type: "object", additionalProperties: { type: ["string", "null"] } },
          capabilities: { type: "array", items: { type: "string" } },
          signing: { type: "string" },
          dataSource: { type: "string" },
          links: { type: "object", additionalProperties: { type: "string" } },
          chain: {
            type: "object",
            properties: {
              id: { type: "integer", examples: [4663] },
              name: { type: "string" },
              env: { type: "string", enum: ["testnet", "mainnet"] },
              explorer: { type: "string", format: "uri" },
              nativeCurrency: { type: "string" },
              reachable: { type: "boolean" },
              latestBlock: { type: "integer" },
              l1BlockNumber: { type: ["integer", "null"] },
              blockTime: { type: "integer", description: "Unix seconds of the latest block." },
              error: { type: "string", description: "Present only when reachable is false." },
            },
          },
          paused: { type: ["object", "null"], properties: { treasury: ref("PauseFlags"), game: ref("PauseFlags"), vault: ref("PauseFlags") } },
          treasury: { type: ["object", "null"], properties: { solvent: { type: "boolean" }, availableBankroll: units, unit: { type: "string" } } },
          operator: {
            type: "object",
            description: "Liveness signals read from chain. The API has no connection to the operator process itself.",
            properties: {
              lastRoundOpened: nullable({ type: "object", properties: { roundId, tableId, status: { type: "string" }, openedAt: { type: "integer" }, ageSeconds: { type: "integer" } } }),
              lastRoundOpenedNote: { type: ["string", "null"] },
              newestOraclePrice: nullable({ type: "object", properties: { updatedAt: { type: "integer" }, ageSeconds: { type: "integer" } } }),
              seatedEscrowUnits: { type: ["integer", "null"], description: "Chip units in table escrow across all players; 0 means nobody is seated." },
              mode: { type: "string" },
            },
          },
          scanWindow: nullable(ref("ScanWindow")),
          problems: { type: "array", items: { type: "string" } },
          time: { type: "string", format: "date-time" },
        },
      },
      CurrentRound: {
        type: "object",
        properties: {
          id: roundId,
          status: { type: "string", enum: ["Open", "Closed"] },
          acceptingBets: { type: "boolean" },
          openedAt: { type: "integer", description: "Unix seconds." },
          betCount: { type: "integer" },
          totalStaked: units,
          reservedUnits: units,
          betsCloseAt: { type: ["integer", "null"], description: "APPROXIMATE unix seconds: openedAt + bettingWindowSeconds. The window is the operator's and is not stored on chain." },
          betsCloseAtApproximate: { const: true },
          bettingWindowSeconds: { type: "integer" },
          timesOutAt: { type: ["integer", "null"], description: "Unix seconds after which anyone may void a round left open." },
        },
      },
      Table: {
        type: "object",
        properties: {
          id: tableId,
          name: { type: "string", examples: ["Table 1"] },
          variant: { const: "European Roulette" },
          status: { type: "string", enum: ["live", "locked"] },
          visibility: { type: "string", enum: ["public", "private"] },
          active: { type: "boolean" },
          lockedReason: { type: ["string", "null"] },
          limits: {
            type: "object",
            properties: { minBet: units, maxBet: units, maxOutside: units, maxStraight: units, treasuryMaxOutside: units, treasuryMaxStraight: units },
          },
          currentRound: nullable(ref("CurrentRound")),
          operator: {
            type: "string",
            enum: ["round-open", "awaiting-reveal", "between-rounds", "waiting-for-players"],
            description: "waiting-for-players: nobody has chips in escrow, so no rounds are opened (normal, not an error). between-rounds: players are seated and the next round is expected.",
          },
          lastRound: nullable({ type: "object", properties: { id: roundId, status: { type: "string", enum: ["Settled", "Voided"] }, result: { type: ["integer", "null"] }, openedAt: { type: "integer" } } }),
          recent: { type: "array", items: { type: "integer", minimum: 0, maximum: 36 }, description: "Results settled inside the scan window, newest first." },
        },
      },
      Treasury: {
        type: "object",
        properties: {
          unit: { const: "chip units" },
          usdBasis: { type: "string", description: "States that USD is peg-derived." },
          peg: { type: "object", properties: { hasPeg: { type: "boolean" }, chipPriceWei: { type: "string" }, chipUsd: { type: "number" } } },
          snapshot: { type: "object", properties: { bankroll: units, reservedLiability: units, claimableRewards: units, protocolReserve: units, rewardInventoryBucket: units, escrow: units, unsettledRounds: { type: "integer" } } },
          derived: {
            type: "object",
            properties: {
              safetyReserve: units,
              availableBankroll: units,
              maxRoundExposure: { ...units, description: "Per-round cap on net liability" },
              totalAssets: units,
              liabilities: units,
              collateralizationPct: { type: ["number", "null"], description: "null while there are no liabilities." },
              maxStraightStake: units,
              maxOutsideStake: units,
              tableOpen: { type: "boolean" },
              reason: { type: ["string", "null"], enum: ["paused", "insufficient-bankroll", "exposure-cap", null] },
              isSolvent: { type: "boolean" },
            },
          },
          usdAtPeg: { type: "object", additionalProperties: { type: "number" }, description: "The same buckets in USD at the chip peg." },
          wei: { type: "object", additionalProperties: { type: "string" }, description: "Raw wei buckets, decimal strings." },
          inFlightRounds: { type: "array", items: { type: "object" } },
          config: { type: "object" },
          pause: { type: "object", properties: { treasury: ref("PauseFlags"), game: ref("PauseFlags"), vault: ref("PauseFlags") } },
          formula: { type: "object", additionalProperties: { type: "string" } },
          source: { type: "string" },
          block: ref("Block"),
        },
      },
      Limits: {
        type: "object",
        properties: {
          unit: { const: "chip units" },
          multiplier: { type: "integer" },
          existingLiability: units,
          availableBankroll: units,
          safetyReserve: units,
          maxRoundExposure: units,
          maxStake: units,
          tableOpen: { type: "boolean" },
          reason: { type: ["string", "null"], enum: ["paused", "insufficient-bankroll", "exposure-cap", null] },
          maxStakeByKind: { type: "object", additionalProperties: { type: "integer" } },
          chipUsd: { type: "number" },
          usdBasis: { type: "string" },
          formula: { type: "string" },
          note: { type: "string" },
          block: ref("Block"),
        },
      },
      RewardAsset: {
        type: "object",
        properties: {
          id: { type: "string", examples: ["crypto-cashcat", "stock-nvda"] },
          symbol: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
          category: { type: ["string", "null"], enum: ["stock-token", "crypto", "special", null] },
          contractAddress: { ...address, type: ["string", "null"] },
          decimals: { type: "integer" },
          registered: { type: "boolean", description: "Registered on the RewardVault." },
          enabled: { type: "boolean" },
          status: { type: "string", enum: ["available", "low", "unavailable", "unverified"] },
          statusLabel: { type: "string" },
          vaultStatus: { type: ["string", "null"], enum: ["AVAILABLE", "LOW", "UNAVAILABLE", null], description: "RewardVault.status; null when the asset is not on chain." },
          inventory: { type: ["string", "null"], description: "Token base units, decimal string." },
          inventoryTokens: { type: ["number", "null"] },
          priceUsd: { type: ["number", "null"], description: "Fresh posted price a claim would use; null when unset or stale." },
          inventoryUsd: { type: ["number", "null"] },
          minimumPayoutUsd: { type: "number" },
          oracle: { ...address, type: ["string", "null"] },
          postedPriceUsd: { type: ["number", "null"], description: "Last posted price even if stale." },
          priceUpdatedAt: { type: ["integer", "null"], description: "Unix seconds." },
          priceAgeSeconds: { type: ["integer", "null"] },
          maxStalenessSeconds: { type: ["integer", "null"] },
          priceStale: { type: ["boolean", "null"] },
        },
      },
      Rewards: {
        type: "object",
        properties: {
          totalInventoryUsd: { type: "number" },
          assets: { type: "array", items: ref("RewardAsset") },
          vault: { type: "object", properties: { address: { ...address, type: ["string", "null"] }, totalWinBalanceUsd: { type: "number" }, totalCreditedUsd: { type: "number" }, totalClaimedUsd: { type: "number" } } },
          source: { type: "string" },
          note: { type: "string" },
          block: ref("Block"),
        },
      },
      Price: {
        type: "object",
        properties: {
          id: { type: "string" },
          symbol: { type: ["string", "null"] },
          contractAddress: address,
          priceUsd: { type: ["number", "null"], description: "USD per whole token as last posted to the oracle." },
          priceUsd1e18: { type: ["string", "null"] },
          updatedAt: { type: ["integer", "null"], description: "Unix seconds." },
          ageSeconds: { type: ["integer", "null"] },
          maxStalenessSeconds: { type: "integer" },
          stale: { type: "boolean" },
          source: { const: "onchain-oracle" },
          oracle: { ...address, type: ["string", "null"] },
        },
      },
      Round: {
        type: "object",
        required: ["roundId", "tableId", "status"],
        properties: {
          roundId,
          tableId,
          status: { type: "string", enum: ["Open", "Closed", "Settled", "Voided"] },
          randomnessStatus: { type: ["string", "null"], enum: ["None", "Committed", "Locked", "Revealed", "Void", null] },
          openedAt: { type: "integer", description: "Unix seconds." },
          result: { type: ["integer", "null"], minimum: 0, maximum: 36, description: "null unless Settled." },
          color: { type: ["string", "null"], enum: ["red", "black", "green", null] },
          parity: { type: ["string", "null"], enum: ["odd", "even", "zero", null] },
          dozen: { type: ["integer", "null"] },
          column: { type: ["integer", "null"] },
          half: { type: ["string", "null"], enum: ["low", "high", null] },
          betCount: { type: "integer" },
          totalStaked: units,
          totalReturned: units,
          reservedUnits: units,
          commitment: nullable(hex32),
          playerSeed: nullable(hex32),
          serverSeed: nullable(hex32),
          blockRef: nullable(hex32),
          committedAtBlock: { type: ["integer", "null"], description: "L1 block number." },
          revealAfterBlock: { type: ["integer", "null"], description: "L1 block number." },
          settledAtBlock: { type: ["integer", "null"], description: "L2 block of the RoundSettled log (list responses)." },
          verified: { type: ["boolean", "null"], description: "Seeds reproduce the commitment and the result; null until revealed." },
        },
      },
      Bet: {
        type: "object",
        properties: {
          index: { type: "integer" },
          player: address,
          betId: { type: ["string", "null"] },
          label: { type: ["string", "null"] },
          numbers: { type: "array", items: { type: "integer" } },
          numbersMaskHex: { type: "string" },
          multiplier: { type: "integer" },
          stake: units,
        },
      },
      Stats: {
        type: "object",
        properties: {
          table: { type: ["string", "null"] },
          window: { type: "integer" },
          sampled: { type: "integer" },
          roundsSettled: { type: "integer" },
          totalStaked: units,
          totalReturned: units,
          usdAtPeg: { type: "object", additionalProperties: { type: "number" } },
          color: { type: "object", additionalProperties: { type: "integer" } },
          parity: { type: "object", additionalProperties: { type: "integer" } },
          dozen: { type: "object", additionalProperties: { type: "integer" } },
          column: { type: "object", additionalProperties: { type: "integer" } },
          half: { type: "object", additionalProperties: { type: "integer" } },
          pockets: { type: "array", items: { type: "integer" }, minItems: 37, maxItems: 37 },
          latest: { type: "array", items: { type: "integer" } },
          blockWindow: ref("ScanWindow"),
          source: { type: "string" },
          usdBasis: { type: "string" },
          expected: { type: "object", additionalProperties: { type: "number" } },
          note: { type: "string" },
        },
      },
      VerifyRequest: {
        type: "object",
        required: ["roundId", "commitment", "serverSeed", "playerSeed", "blockRef"],
        properties: { roundId, commitment: hex32, serverSeed: hex32, playerSeed: hex32, blockRef: hex32, result: { type: "integer", minimum: 0, maximum: 36 } },
      },
      VerifyResult: {
        type: "object",
        properties: {
          roundId,
          commitOk: { type: "boolean" },
          derivedResult: { type: "integer", minimum: 0, maximum: 36 },
          derivedColor: { type: "string", enum: ["red", "black", "green"] },
          resultOk: { type: ["boolean", "null"], description: "null when no result was supplied" },
          verified: { type: "boolean" },
          formula: { type: "string" },
        },
      },
      BetInput: {
        type: "object",
        required: ["betId", "stake"],
        properties: {
          betId: {
            type: "string",
            description: "red | black | odd | even | low | high | dozen:1..3 | column:1..3 | straight:N | split:A-B | street:S | corner:TL | sixline:S",
            examples: ["red", "dozen:2", "straight:17", "split:17-20", "street:4", "corner:25", "sixline:31"],
          },
          stake: { type: "integer", minimum: 1, description: "Whole chip units (uint128 on chain)." },
        },
      },
      QuoteRequest: {
        type: "object",
        required: ["bets"],
        properties: {
          bets: { type: "array", minItems: 1, maxItems: 64, items: ref("BetInput") },
          table: { ...tableId, description: "Apply this table's stake range and include its Open round's existing bets." },
          roundId: { ...roundId, description: "Quote against this round instead of the table's current one." },
        },
      },
      Quote: {
        type: "object",
        properties: {
          bets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                betId: { type: "string" },
                kind: { type: "string" },
                label: { type: "string" },
                numbers: { type: "array", items: { type: "integer" } },
                multiplier: { type: "integer" },
                stake: units,
                potentialPayout: { ...units, description: "stake × (multiplier + 1)" },
                potentialProfit: units,
                error: { type: ["string", "null"] },
              },
            },
          },
          totalWager: units,
          maximumLiability: { type: "object", description: "Worst case of the submitted bets alone.", properties: { worstResult: { type: "integer" }, maxReturn: units, maxNetPayout: units } },
          limit: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              reason: { type: ["string", "null"], examples: ["Table limit reached"] },
              code: { type: ["string", "null"], enum: ["paused", "table-inactive", "round-not-open", "stake-out-of-range", "too-many-bets", "exposure-cap", null] },
              maxNetPayout: { ...units, description: "Worst-case net payout of the round's whole bet set after these bets." },
              maxRoundExposure: units,
              availableBankroll: { ...units, description: "availableBankrollUnits plus the round's own reservation, as placeBets passes it to the risk engine." },
              maxStraight: units,
              maxOutside: units,
            },
          },
          table: nullable({ type: "object", properties: { id: tableId, minBet: units, maxBet: units, status: { type: "string", enum: ["live", "locked"] } } }),
          round: nullable({ type: "object", properties: { id: roundId, status: { type: "string" }, existingBets: { type: "integer" }, reservedUnits: units } }),
          accepted: { type: "boolean" },
          unit: { const: "chip units" },
          source: { type: "string" },
        },
      },
      TxIntent: {
        type: "object",
        description: "Unsigned transaction for the agent's own wallet. `to` is always a deployed contract address. This API never signs and never broadcasts.",
        required: ["to", "chainId", "value", "data", "abi", "description", "warnings"],
        properties: {
          to: address,
          contract: { type: "string", enum: ["RouletteGame", "Chip1155", "CasinoTreasury", "RewardVault"] },
          chainId: { type: "integer", examples: [4663] },
          value: { type: "string", description: "Wei, decimal string. Always \"0\"." },
          data: { type: "string", pattern: "^0x[0-9a-fA-F]*$", description: "Calldata encoded with the deployed contract's ABI." },
          abi: {
            type: "object",
            properties: { name: { type: "string" }, signature: { type: "string", examples: Object.values(FUNCTION_SIGNATURES) }, args: { type: "array" } },
          },
          description: { type: "string" },
          warnings: { type: "array", items: { type: "string" } },
          signedBy: { const: "agent-wallet" },
        },
      },
      Account: {
        type: "object",
        description: "The caller's on-chain balances the preflight used.",
        properties: {
          address,
          walletChipUnits: units,
          walletChips: { type: "object", additionalProperties: { type: "integer" }, description: "Chip count per denomination (1, 5, 10, 25, 50, 100)." },
          escrowUnits: units,
          chipsApproved: { type: "boolean", description: "Chip1155.isApprovedForAll(address, treasury)." },
          winBalanceUsd: { type: "number" },
          withdrawableWei: { type: "string" },
        },
      },
      EnterTableRequest: {
        type: "object",
        required: ["address"],
        properties: {
          address: callerAddress,
          units: { type: "integer", minimum: 1, description: "Chip units to escrow, picked largest denomination first from the wallet. Omit (and omit chips) to escrow every chip." },
          chips: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            description: "Alternatively, exact chips by denomination. Not together with units.",
            items: { type: "object", required: ["denomination", "count"], properties: { denomination: { type: "integer", enum: [1, 5, 10, 25, 50, 100] }, count: { type: "integer", minimum: 1 } } },
          },
        },
      },
      EnterTableIntent: {
        type: "object",
        properties: {
          intent: ref("TxIntent"),
          prerequisites: { type: "array", items: ref("TxIntent"), description: "Sign these first, in order: Chip1155.setApprovalForAll(treasury, true) when the approval is missing; empty otherwise." },
          units: { type: "integer" },
          chips: { type: "array", items: { type: "object", properties: { denomination: { type: "integer" }, tokenId: { type: "string" }, count: { type: "integer" } } } },
          account: ref("Account"),
          preflight: { type: "object" },
          note: { type: "string" },
        },
      },
      PlaceBetsRequest: {
        type: "object",
        required: ["address", "bets"],
        properties: {
          address: callerAddress,
          roundId: { ...roundId, description: "Round to bet on. Omit to use the table's current Open round." },
          table: { ...tableId, description: "Defaults to the default table." },
          bets: { type: "array", minItems: 1, maxItems: 64, items: ref("BetInput") },
        },
      },
      PlaceBetsIntent: {
        type: "object",
        properties: {
          intent: ref("TxIntent"),
          quote: ref("Quote"),
          round: { type: "object", properties: { id: roundId, table: tableId, status: { const: "Open" }, openedAt: { type: "integer" }, betsCloseAt: { type: ["integer", "null"], description: "Approximate." }, betsCloseAtApproximate: { const: true } } },
          account: ref("Account"),
          maxLiability: units,
          limitCheck: { type: "object" },
          encoding: { type: "string" },
          note: { type: "string" },
        },
      },
      LeaveTableRequest: {
        type: "object",
        required: ["address"],
        properties: { address: callerAddress, units: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^[1-9]\\d*$" }], description: "Omit to withdraw the whole escrow." } },
      },
      LeaveTableIntent: { type: "object", properties: { intent: ref("TxIntent"), units: { type: "string" }, account: ref("Account"), preflight: { type: "object" }, note: { type: "string" } } },
      MaxClaimable: {
        type: "object",
        description: "The most a wallet can claim of one asset right now, from chain values only: min(win balance, vault inventory × fresh posted price).",
        properties: {
          maxClaimableUsd: { type: "number" },
          maxClaimableUsd1e18: { type: "string", description: "USD, 1e18 fixed point." },
          maxClaimableUsdAmount: { type: "string", description: "The maximum as an exact decimal string: pass it as usdAmount to claim everything claimable." },
          limitedBy: { type: ["string", "null"], enum: ["win-balance", "inventory", null] },
          blocker: { type: ["string", "null"], enum: ["not-enabled", "no-price", "no-inventory", "no-balance", "below-minimum", null], description: "Why nothing is claimable; null when maxClaimableUsd can be claimed." },
          inventory: { type: "string", description: "Vault inventory, token base units." },
          inventoryTokens: { type: "number" },
          inventoryUsd: { type: "number", description: "Vault inventory valued at the fresh posted price; 0 without one." },
        },
      },
      ConvertToRewardsRequest: {
        type: "object",
        required: ["address"],
        additionalProperties: false,
        properties: {
          address: callerAddress,
          units: { type: "integer", minimum: 1, description: "Chip units to convert, picked largest denomination first from the wallet. Omit (and omit chips) to convert every wallet chip. Chips in table escrow are not convertible until they leave the table." },
          chips: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            description: "Alternatively, exact chips by denomination. Not together with units.",
            items: { type: "object", required: ["denomination", "count"], properties: { denomination: { type: "integer", enum: [1, 5, 10, 25, 50, 100] }, count: { type: "integer", minimum: 1 } } },
          },
        },
      },
      ConvertToRewardsIntent: {
        type: "object",
        description: "Step 1 of the reward flow. One-way: the chips are burned and the win balance can only be claimed as reward assets.",
        properties: {
          intent: ref("TxIntent"),
          prerequisites: { type: "array", items: ref("TxIntent"), description: "Sign these first, in order: Chip1155.setApprovalForAll(treasury, true) when the approval is missing; empty otherwise." },
          units: { type: "integer" },
          chips: { type: "array", items: { type: "object", properties: { denomination: { type: "integer" }, tokenId: { type: "string" }, count: { type: "integer" } } } },
          credit: { type: "object", description: "USD credited to the win balance: units × CasinoTreasury.chipUsdValue.", properties: { usd: { type: "number" }, usd1e18: { type: "string" }, chipUsdValue: { type: "number" } } },
          backing: { type: "object", description: "ETH that moves to the treasury's claimable earmark: units × chipPriceWei. The win balance is USD at the chip peg while this backing is ETH.", properties: { wei: { type: "string" }, chipPriceWei: { type: "string" } } },
          oneWay: { const: true },
          account: ref("Account"),
          preflight: { type: "object", properties: { chipsApproved: { type: "boolean" }, claimsPaused: { const: false }, walletChipUnitsAfter: { type: "integer" }, winBalanceUsdAfter: { type: "number" } } },
          claimableAfter: {
            type: "array",
            description: "What each registered reward asset could pay of the resulting win balance right now.",
            items: { allOf: [{ type: "object", properties: { symbol: { type: ["string", "null"] }, contractAddress: address } }, ref("MaxClaimable")] },
          },
          warnings: { type: "array", items: { type: "string" }, description: "Present when the vault cannot pay the resulting win balance right now (inventory is restocked in batches)." },
          note: { type: "string" },
        },
      },
      ClaimRequest: {
        type: "object",
        required: ["address", "asset", "usdAmount"],
        additionalProperties: false,
        properties: {
          address: callerAddress,
          asset: { type: "string", description: "ERC-20 address, registry id (crypto-cashcat) or symbol (CASHCAT)." },
          usdAmount: { oneOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "string", pattern: "^\\d+(\\.\\d{1,18})?$" }], description: "USD of win balance; encoded as 1e18 fixed point" },
          slippageBps: { type: "integer", minimum: 0, maximum: 5000, default: 50, description: "Tolerance applied to the live vault quote to derive minOut." },
          minOut: { type: "string", pattern: "^\\d+$", description: "Override minOut (token base units) instead of deriving it." },
          deadlineMinutes: { type: "integer", minimum: 1, maximum: 1440, default: 10 },
        },
      },
      ClaimIntent: {
        type: "object",
        properties: {
          intent: ref("TxIntent"),
          asset: ref("RewardAsset"),
          usdAmount1e18: { type: "string" },
          quote: { type: "object", properties: { amountOut: { type: "string" }, priceUsd1e18: { type: "string" }, priceUsd: { type: "number" }, decimals: { type: "integer" } } },
          minOut: { type: "string" },
          slippageBps: { type: ["integer", "null"] },
          deadline: { type: "string", description: "Unix seconds." },
          maxClaimableNow: ref("MaxClaimable"),
          account: ref("Account"),
          note: { type: "string" },
        },
      },
      Dataset: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          endpoint: { type: "string" },
          method: { type: "string" },
          refreshCadence: { type: "string" },
          suggestedPollSeconds: { type: "integer" },
          granularity: { type: "string" },
          history: { type: "string" },
          demo: { type: "boolean" },
          provenance: { type: "string" },
          license: { type: "string" },
          fields: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, description: { type: "string" }, enum: { type: "array" } } } },
          pagination: { type: ["object", "null"] },
          filters: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
