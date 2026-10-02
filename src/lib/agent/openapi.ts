import { API_VERSION } from "./envelope";
import { FUNCTION_SIGNATURES } from "./intents";

/**
 * OpenAPI 3.1 document for /api/v1. Hand-written so it stays readable; the
 * `openapi.test.ts` suite asserts that every route file has a path entry.
 */
type Schema = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const envelope = (dataSchema: Schema, description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["ok", "demo", "data"],
        properties: { ok: { const: true }, demo: { type: "boolean", description: "True when served from demo data." }, data: dataSchema },
      },
    },
  },
});

const errorResponse = (description: string, extra: Schema = {}) => ({
  description,
  content: { "application/json": { schema: { allOf: [ref("ErrorEnvelope"), ...(Object.keys(extra).length ? [{ type: "object", properties: extra }] : [])] } } },
});

const standardErrors = {
  "400": errorResponse("Validation error"),
  "404": errorResponse("Not found"),
  "429": errorResponse("Rate limited (POST routes only)"),
};

const intentResponses = (dataName: string) => ({
  "200": envelope(ref(dataName), "Unsigned transaction intent. Sign with your own wallet."),
  "409": errorResponse("CONTRACTS_NOT_DEPLOYED: contract address not configured; `preview` holds the fully encoded intent with `to: null`.", { preview: ref(dataName) }),
  ...standardErrors,
});

const hex32: Schema = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$", examples: ["0x" + "ab".repeat(32)] };
const address: Schema = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
const chipUnits: Schema = { type: "number", description: "Chip units (1 chip unit = 1 USD-equivalent at the configured chip price)." };

export const openapiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Roulette Protocol API",
    version: API_VERSION,
    summary: "Agent-ready read, verify, quote and unsigned-intent interface for a social roulette club built on Robinhood Chain.",
    description: [
      "Machine interface for AI agents and integrations. Reads are public and cacheable; the four `intents` routes return UNSIGNED transaction intents that the agent's own wallet must sign.",
      "This API never holds keys and never signs. Agents are bound by the same age, jurisdiction and responsible-play gates as human players, and every wager is limited by treasury collateral before acceptance.",
      "Status: beta and demo-backed until contracts deploy. Every response carries `demo: true` when served from simulated data.",
      "Independent product built on Robinhood Chain. Not affiliated with, endorsed by or operated by Robinhood.",
    ].join("\n\n"),
    contact: { url: "/developers" },
    "x-agent-ready": true,
    "x-signing": "never",
    "x-network": "Robinhood Chain",
  },
  servers: [{ url: "/api/v1", description: "Same origin" }],
  tags: [
    { name: "read", description: "Public reads (GET, cacheable, CORS *)" },
    { name: "fairness", description: "Commit–reveal verification" },
    { name: "quote", description: "Pre-acceptance limit check" },
    { name: "intents", description: "Unsigned transaction intents (never signed here)" },
    { name: "meta", description: "Discovery" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["meta"],
        operationId: "getHealth",
        summary: "Service, chain and deployment status",
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
        summary: "Dataset catalog with field dictionaries and refresh cadence",
        responses: { "200": envelope({ type: "object", properties: { datasets: { type: "array", items: ref("Dataset") } } }, "OK") },
      },
    },
    "/tables": {
      get: {
        tags: ["read"],
        operationId: "listTables",
        summary: "All tables with effective limits",
        responses: { "200": envelope({ type: "object", properties: { tables: { type: "array", items: ref("Table") }, count: { type: "integer" } } }, "OK") },
      },
    },
    "/tables/{id}": {
      get: {
        tags: ["read"],
        operationId: "getTable",
        summary: "One table",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "neon-01" }],
        responses: { "200": envelope({ type: "object", properties: { table: ref("Table") } }, "OK"), "404": standardErrors["404"] },
      },
    },
    "/treasury": {
      get: { tags: ["read"], operationId: "getTreasury", summary: "Treasury snapshot, available bankroll, exposure cap and collateralization", responses: { "200": envelope(ref("Treasury"), "OK") } },
    },
    "/limits": {
      get: {
        tags: ["read"],
        operationId: "getLimits",
        summary: "Maximum safe stake for a payout multiplier",
        parameters: [
          { name: "multiplier", in: "query", schema: { type: "integer", minimum: 1, default: 35 }, description: "Profit multiplier: 35 straight, 17 split, 11 street, 8 corner, 5 six-line, 2 dozen/column, 1 even-money." },
          { name: "existingLiability", in: "query", schema: { type: "number", minimum: 0, default: 0 } },
        ],
        responses: { "200": envelope(ref("Limits"), "OK"), "400": standardErrors["400"] },
      },
    },
    "/rewards": {
      get: { tags: ["read"], operationId: "listRewards", summary: "Reward inventory and statuses", responses: { "200": envelope(ref("Rewards"), "OK") } },
    },
    "/prices": {
      get: {
        tags: ["read"],
        operationId: "listPrices",
        summary: "Reference USD prices for reward assets with a contract (mirrors what the operator posts to the onchain oracle)",
        responses: {
          "200": envelope(
            {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  symbol: { type: "string" },
                  contractAddress: { type: "string" },
                  priceUsd: { type: ["number", "null"] },
                  updatedAt: { type: ["integer", "null"], description: "unix seconds" },
                  source: { type: ["string", "null"], enum: ["coingecko", "reference-snapshot", null] },
                  oracle: { type: ["string", "null"], description: "feed descriptor until the PostedPriceOracle is deployed, then its address" },
                },
              },
            },
            "OK",
          ),
        },
      },
    },
    "/rounds": {
      get: {
        tags: ["read", "fairness"],
        operationId: "listRounds",
        summary: "Settled rounds with fairness proofs (newest first, cursor paginated)",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "cursor", in: "query", schema: { type: "integer" }, description: "Return rounds with roundId strictly below this value (use nextCursor)." },
          { name: "table", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": envelope({ type: "object", properties: { rounds: { type: "array", items: ref("Round") }, nextCursor: { type: ["integer", "null"] }, total: { type: "integer" }, proof: { type: "string" } } }, "OK"),
          ...standardErrors,
        },
      },
    },
    "/rounds/{id}": {
      get: {
        tags: ["read", "fairness"],
        operationId: "getRound",
        summary: "One round with a ready-to-send verify body",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, example: 120479 }],
        responses: { "200": envelope({ type: "object", properties: { round: ref("Round"), verify: { type: "object", properties: { endpoint: { type: "string" }, body: ref("VerifyRequest") } } } }, "OK"), ...standardErrors },
      },
    },
    "/stats": {
      get: {
        tags: ["read"],
        operationId: "getStats",
        summary: "Outcome counts over a window (descriptive only; spins are independent)",
        parameters: [
          { name: "table", in: "query", schema: { type: "string" } },
          { name: "window", in: "query", schema: { type: "integer", minimum: 1, maximum: 480, default: 100 } },
        ],
        responses: { "200": envelope(ref("Stats"), "OK"), ...standardErrors },
      },
    },
    "/verify": {
      post: {
        tags: ["fairness"],
        operationId: "verifyRound",
        summary: "Recompute commitment and result for a round tuple",
        requestBody: { required: true, content: { "application/json": { schema: ref("VerifyRequest") } } },
        responses: { "200": envelope(ref("VerifyResult"), "OK (demo is always false: pure math over caller input)"), ...standardErrors },
      },
    },
    "/quote": {
      post: {
        tags: ["quote"],
        operationId: "quoteBets",
        summary: "Validate bets and run the treasury pre-acceptance check",
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("QuoteRequest"), example: { bets: [{ betId: "red", stake: 10 }, { betId: "straight:17", stake: 1 }], table: "neon-01" } } },
        },
        responses: { "200": envelope(ref("Quote"), "Quote (check `accepted`; a rejected set still returns 200)"), ...standardErrors },
      },
    },
    "/intents/enter-table": {
      post: {
        tags: ["intents"],
        operationId: "buildEnterTableIntent",
        summary: `Unsigned RouletteGame.${FUNCTION_SIGNATURES.enterTable} plus the one-time Chip1155 approval prerequisite`,
        requestBody: { required: true, content: { "application/json": { schema: ref("EnterTableRequest"), example: { chips: [{ denomination: 5, count: 4 }, { denomination: 1, count: 10 }] } } } },
        responses: intentResponses("EnterTableIntent"),
      },
    },
    "/intents/place-bets": {
      post: {
        tags: ["intents"],
        operationId: "buildPlaceBetsIntent",
        summary: `Unsigned RouletteGame.${FUNCTION_SIGNATURES.placeBets}; bets must pass the quote first`,
        requestBody: { required: true, content: { "application/json": { schema: ref("PlaceBetsRequest"), example: { roundId: 120500, table: "neon-01", bets: [{ betId: "red", stake: 10 }] } } } },
        responses: { ...intentResponses("PlaceBetsIntent"), "409": errorResponse("TABLE_LIMIT (details.quote explains) or CONTRACTS_NOT_DEPLOYED (preview holds the encoded intent)", { preview: ref("PlaceBetsIntent") }) },
      },
    },
    "/intents/leave-table": {
      post: {
        tags: ["intents"],
        operationId: "buildLeaveTableIntent",
        summary: `Unsigned RouletteGame.${FUNCTION_SIGNATURES.leaveTable}`,
        requestBody: { required: true, content: { "application/json": { schema: ref("LeaveTableRequest"), example: { units: 25 } } } },
        responses: intentResponses("LeaveTableIntent"),
      },
    },
    "/intents/claim": {
      post: {
        tags: ["intents"],
        operationId: "buildClaimIntent",
        summary: `Unsigned RewardVault.${FUNCTION_SIGNATURES.claimAs}`,
        requestBody: { required: true, content: { "application/json": { schema: ref("ClaimRequest"), example: { asset: "crypto-eth", usdAmount: "12.50", minOut: "0", deadline: 1790000000 } } } },
        responses: intentResponses("ClaimIntent"),
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
          demo: { type: "boolean" },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: ["BAD_REQUEST", "VALIDATION_ERROR", "NOT_FOUND", "RATE_LIMITED", "CONTRACTS_NOT_DEPLOYED", "TABLE_LIMIT", "INTERNAL"] },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      Health: {
        type: "object",
        properties: {
          status: { const: "ok" },
          version: { type: "string" },
          product: { type: "string" },
          network: { const: "Robinhood Chain" },
          chain: { type: "object", properties: { id: { type: "integer", examples: [46630, 4663] }, name: { type: "string" }, env: { type: "string", enum: ["testnet", "mainnet"] }, explorer: { type: "string", format: "uri" }, nativeCurrency: { type: "string" } } },
          demoMode: { type: "boolean" },
          contractsDeployed: { type: "boolean" },
          contracts: { type: "object", additionalProperties: { type: ["string", "null"] } },
          capabilities: { type: "array", items: { type: "string" } },
          signing: { type: "string" },
          links: { type: "object", additionalProperties: { type: "string" } },
          time: { type: "string", format: "date-time" },
        },
      },
      Table: {
        type: "object",
        properties: {
          id: { type: "string", examples: ["neon-01"] },
          name: { type: "string" },
          variant: { const: "European Roulette" },
          status: { type: "string", enum: ["live", "locked", "starting"] },
          visibility: { type: "string", enum: ["public", "private"] },
          speed: { type: "string", enum: ["relaxed", "standard", "fast"] },
          players: { type: "integer" },
          spectators: { type: "integer" },
          lockedReason: { type: ["string", "null"] },
          limits: {
            type: "object",
            properties: { minBet: chipUnits, maxBet: chipUnits, maxOutside: chipUnits, maxStraight: chipUnits, treasuryMaxOutside: chipUnits, treasuryMaxStraight: chipUnits },
          },
          recent: { type: "array", items: { type: "integer", minimum: 0, maximum: 36 }, description: "Newest first" },
        },
      },
      Treasury: {
        type: "object",
        properties: {
          unit: { type: "string" },
          snapshot: { type: "object", properties: { bankroll: { type: "number" }, reservedLiability: { type: "number" }, claimableRewards: { type: "number" }, protocolReserve: { type: "number" }, rewardInventoryUsd: { type: "number" }, unsettledRounds: { type: "integer" } } },
          derived: {
            type: "object",
            properties: {
              safetyReserve: { type: "number" },
              availableBankroll: { type: "number" },
              maxRoundExposure: { type: "number", description: "Per-round cap on net liability" },
              totalAssets: { type: "number" },
              liabilities: { type: "number" },
              collateralizationPct: { type: "number" },
              maxStraightStake: { type: "number" },
              maxOutsideStake: { type: "number" },
              tableOpen: { type: "boolean" },
              reason: { type: ["string", "null"] },
            },
          },
          config: { type: "object" },
          formula: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      Limits: {
        type: "object",
        properties: {
          multiplier: { type: "integer" },
          existingLiability: { type: "number" },
          availableBankroll: { type: "number" },
          safetyReserve: { type: "number" },
          maxRoundExposure: { type: "number" },
          maxStake: { type: "number" },
          tableOpen: { type: "boolean" },
          reason: { type: ["string", "null"], enum: ["insufficient-bankroll", "exposure-cap", null] },
          maxStakeByKind: { type: "object", additionalProperties: { type: "number" } },
          formula: { type: "string" },
        },
      },
      Rewards: {
        type: "object",
        properties: {
          totalInventoryUsd: { type: "number" },
          assets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", examples: ["crypto-eth", "stock-nvda"] },
                symbol: { type: "string" },
                name: { type: "string" },
                category: { type: "string", enum: ["stock-token", "crypto", "special"] },
                contractAddress: { ...address, type: ["string", "null"] },
                decimals: { type: "integer" },
                minimumPayoutUsd: { type: "number" },
                enabled: { type: "boolean" },
                inventoryUsd: { type: "number" },
                priceUsd: { type: ["number", "null"] },
                status: { type: "string", enum: ["available", "low", "unavailable", "unverified"] },
                statusLabel: { type: "string" },
              },
            },
          },
          note: { type: "string" },
        },
      },
      Round: {
        type: "object",
        required: ["roundId", "commitment", "serverSeed", "playerSeed", "blockRef", "result"],
        properties: {
          roundId: { type: "integer" },
          tableId: { type: "string" },
          tableName: { type: "string" },
          at: { type: "integer", description: "Unix ms (UTC)" },
          commitment: hex32,
          serverSeed: hex32,
          playerSeed: hex32,
          blockRef: hex32,
          result: { type: "integer", minimum: 0, maximum: 36 },
          color: { type: "string", enum: ["red", "black", "green"] },
          parity: { type: "string", enum: ["odd", "even", "zero"] },
          dozen: { type: ["integer", "null"] },
          column: { type: ["integer", "null"] },
          half: { type: ["string", "null"], enum: ["low", "high", null] },
          betCount: { type: "integer" },
          totalStaked: { type: "number" },
          totalReturned: { type: "number" },
          verified: { type: "boolean" },
        },
      },
      Stats: {
        type: "object",
        properties: {
          table: { type: ["string", "null"] },
          window: { type: "integer" },
          sampled: { type: "integer" },
          color: { type: "object", additionalProperties: { type: "integer" } },
          parity: { type: "object", additionalProperties: { type: "integer" } },
          dozen: { type: "object", additionalProperties: { type: "integer" } },
          column: { type: "object", additionalProperties: { type: "integer" } },
          half: { type: "object", additionalProperties: { type: "integer" } },
          pockets: { type: "array", items: { type: "integer" }, minItems: 37, maxItems: 37 },
          latest: { type: "array", items: { type: "integer" } },
          expected: { type: "object", additionalProperties: { type: "number" } },
          note: { type: "string" },
        },
      },
      VerifyRequest: {
        type: "object",
        required: ["roundId", "commitment", "serverSeed", "playerSeed", "blockRef"],
        properties: { roundId: { type: "integer", minimum: 0 }, commitment: hex32, serverSeed: hex32, playerSeed: hex32, blockRef: hex32, result: { type: "integer", minimum: 0, maximum: 36 } },
      },
      VerifyResult: {
        type: "object",
        properties: {
          roundId: { type: "integer" },
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
          stake: { ...chipUnits, exclusiveMinimum: 0 },
        },
      },
      QuoteRequest: {
        type: "object",
        required: ["bets"],
        properties: { bets: { type: "array", minItems: 1, maxItems: 64, items: ref("BetInput") }, table: { type: "string", description: "Apply this table's min/max stake as well." } },
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
                stake: chipUnits,
                potentialPayout: { ...chipUnits, description: "stake × (multiplier + 1)" },
                potentialProfit: chipUnits,
                error: { type: ["string", "null"] },
              },
            },
          },
          totalWager: chipUnits,
          maximumLiability: { type: "object", properties: { worstResult: { type: "integer" }, maxReturn: { type: "number" }, maxNetPayout: { type: "number", description: "What the treasury must reserve" } } },
          limit: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              reason: { type: ["string", "null"], examples: ["Table limit reached"] },
              maxNetPayout: { type: "number" },
              maxRoundExposure: { type: "number" },
              availableBankroll: { type: "number" },
              maxStraight: { type: "number" },
              maxOutside: { type: "number" },
            },
          },
          table: { type: ["object", "null"] },
          accepted: { type: "boolean" },
        },
      },
      TxIntent: {
        type: "object",
        description: "Unsigned transaction. `to` is null in demo previews. Sign with the agent's own wallet; this API never signs.",
        required: ["to", "chainId", "value", "data", "abi", "description", "warnings"],
        properties: {
          to: { ...address, type: ["string", "null"] },
          contract: { type: "string", enum: ["RouletteGame", "Chip1155", "CasinoTreasury", "RewardVault"] },
          chainId: { type: "integer", examples: [46630, 4663] },
          value: { type: "string", description: "Wei, decimal string. Always \"0\"." },
          data: { type: "string", pattern: "^0x[0-9a-fA-F]*$" },
          abi: {
            type: "object",
            properties: { name: { type: "string" }, signature: { type: "string", examples: Object.values(FUNCTION_SIGNATURES) }, args: { type: "array" } },
          },
          description: { type: "string" },
          warnings: { type: "array", items: { type: "string" } },
          signedBy: { const: "agent-wallet" },
        },
      },
      EnterTableRequest: {
        type: "object",
        required: ["chips"],
        properties: { chips: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", required: ["denomination", "count"], properties: { denomination: { type: "integer", enum: [1, 5, 10, 25, 50, 100] }, count: { type: "integer", minimum: 1 } } } } },
      },
      EnterTableIntent: {
        type: "object",
        properties: { intent: ref("TxIntent"), prerequisites: { type: "array", items: ref("TxIntent"), description: "Chip1155.setApprovalForAll(treasury, true), once per wallet" }, units: { type: "integer" }, chips: { type: "array" }, note: { type: "string" } },
      },
      PlaceBetsRequest: {
        type: "object",
        required: ["roundId", "bets"],
        properties: {
          roundId: { oneOf: [{ type: "integer", minimum: 0 }, { type: "string", pattern: "^\\d+$" }] },
          bets: { type: "array", minItems: 1, maxItems: 64, items: { allOf: [ref("BetInput"), { type: "object", properties: { stake: { type: "integer", minimum: 1, description: "Whole chip units (uint128)" } } }] } },
          table: { type: "string" },
        },
      },
      PlaceBetsIntent: {
        type: "object",
        properties: { intent: ref("TxIntent"), quote: ref("Quote"), maxLiability: { type: "number" }, limitCheck: { type: "object" }, encoding: { type: "string" } },
      },
      LeaveTableRequest: { type: "object", required: ["units"], properties: { units: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^[1-9]\\d*$" }] } } },
      LeaveTableIntent: { type: "object", properties: { intent: ref("TxIntent"), units: { type: "string" } } },
      ClaimRequest: {
        type: "object",
        required: ["asset", "usdAmount"],
        properties: {
          asset: { type: "string", description: "ERC-20 address or registry id (crypto-eth, stock-nvda, ...)" },
          usdAmount: { oneOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "string", pattern: "^\\d+(\\.\\d{1,18})?$" }], description: "USD; encoded as 1e18 fixed point" },
          minOut: { type: "string", pattern: "^\\d+$", default: "0", description: "Minimum token base units (slippage guard)" },
          deadline: { type: "integer", description: "Unix seconds; default now + 20 min" },
        },
      },
      ClaimIntent: { type: "object", properties: { intent: ref("TxIntent"), asset: { type: "object" }, usdAmount1e18: { type: "string" }, deadline: { type: "string" } } },
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
} as const;

export type OpenApiDocument = typeof openapiDocument;
