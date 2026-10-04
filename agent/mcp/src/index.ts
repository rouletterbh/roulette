#!/usr/bin/env bun
/**
 * MCP server for Roblette's agent-ready REST API (onchain roulette on Robinhood Chain).
 *
 * Thin client: every tool calls /api/v1 and returns the JSON envelope as structured
 * content. The API reads the deployed contracts; this server adds nothing of its own.
 * It never holds keys and never signs; the `build_*` tools return UNSIGNED transactions
 * (to, data, value, chainId) that the agent's own wallet must review and sign.
 *
 *   ROULETTE_API_URL   base URL of the web app (default: the production site)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const DEFAULT_API_URL = "https://roulette-three-blond.vercel.app";
export const API_URL = (process.env.ROULETTE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const BASE = `${API_URL}/api/v1`;

/* ---------------------------------------------------------------- HTTP */

interface Envelope {
  ok: boolean;
  demo?: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
  preview?: unknown;
}

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: Envelope }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: Envelope;
  try {
    body = JSON.parse(text) as Envelope;
  } catch {
    body = { ok: false, error: { code: "BAD_GATEWAY", message: `Non-JSON response (${res.status}) from ${path}: ${text.slice(0, 200)}` } };
  }
  return { status: res.status, body };
}

const get = (path: string, query?: Record<string, string | number | undefined>) => {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return call(qs ? `${path}?${qs}` : path);
};
const post = (path: string, body: unknown) => call(path, { method: "POST", body: JSON.stringify(body) });

/** Tool result: text for models that read text, structuredContent for those that read JSON. */
function result({ status, body }: { status: number; body: Envelope }) {
  const structured = { httpStatus: status, ...body } as Record<string, unknown>;
  const lines: string[] = [];
  if (body.ok) {
    lines.push(body.demo ? "ok (simulated data: this deployment is not reading the chain)" : "ok");
  } else {
    lines.push(`error ${body.error?.code ?? status}: ${body.error?.message ?? "unknown"}`);
    if (body.preview) lines.push("A preview of the intent is included (contracts not configured on this deployment; `to` is null). Do not sign it.");
  }
  lines.push(JSON.stringify(body.ok ? body.data : { error: body.error, preview: body.preview }, null, 2));
  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    structuredContent: structured,
    // Validation / limit failures are informative, not tool failures; only transport-level problems are errors.
    isError: !body.ok && status >= 500,
  };
}

const outputSchema = {
  httpStatus: z.number(),
  ok: z.boolean(),
  demo: z.boolean().optional(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }).optional(),
  preview: z.unknown().optional(),
};

/* ---------------------------------------------------------------- schemas */

const betId = z.string().min(1).max(32).describe("Stable bet id: red | black | odd | even | low | high | dozen:1..3 | column:1..3 | straight:N | split:A-B | street:S | corner:TL | sixline:S");
const intBets = z.array(z.object({ betId, stake: z.number().int().positive().describe("Stake in whole chip units (uint128 on chain)") })).min(1).max(64);
const bets = intBets;
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .describe("Your wallet address (0x…, lowercase or EIP-55 checksummed). Used only for read-only preflight against your on-chain balances; nothing is signed.");
const tableId = z.string().regex(/^[1-9]\d*$/).describe('On-chain table id as a string, e.g. "1" (see list_tables)');
const roundId = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).describe("On-chain round id (uint256): integer, or decimal string for very large ids");
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe("0x-prefixed 32-byte hex");

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const builder = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/* ---------------------------------------------------------------- server */

export function createServer() {
  const server = new McpServer(
    { name: "roulette-protocol", version: "0.2.0" },
    {
      instructions: [
        "Agent-ready interface for Roblette, onchain roulette on Robinhood Chain (independent product; not affiliated with Robinhood).",
        "Tools read live contract state (tables, rounds, treasury, reward vault, oracle prices), verify commit-reveal proofs, quote bets against the treasury limit and build UNSIGNED transactions.",
        "This server never signs and never broadcasts. Every build_* tool takes your wallet address, checks your on-chain balances and returns { to, data, value, chainId } for your own wallet to sign; when a precondition fails you get a specific error code (ROUND_NOT_OPEN, INSUFFICIENT_ESCROW, NO_CHIPS, INSUFFICIENT_CHIPS, ASSET_UNAVAILABLE, INSUFFICIENT_WIN_BALANCE, TABLE_LIMIT, PAUSED) instead of a transaction.",
        "Typical loop: list_tables → quote_bets → build_enter_table_intent (sign) → poll get_table until currentRound.status is Open → build_place_bets_intent (sign promptly, the betting window is about 45 s) → get_round and verify_round → build_leave_table_intent (sign).",
        "Rounds open only while a player has chips in table escrow, so currentRound null with operator waiting-for-players is normal. Amounts are whole chip units; USD figures are peg-derived. CHAIN_UNAVAILABLE means the chain could not be read: retry.",
        "Agents are bound by the same age, jurisdiction and responsible-play rules as humans. The wheel keeps 1/37 of every bet on average; every spin is independent and stats describe the past only.",
      ].join(" "),
    },
  );

  server.registerTool(
    "get_health",
    { title: "Health", description: "Chain id and latest block, configured contract addresses, pause flags, treasury solvency and operator liveness signals (age of the last round opened and of the newest oracle price).", inputSchema: {}, outputSchema, annotations: readOnly },
    async () => result(await get("/health")),
  );

  server.registerTool(
    "list_tables",
    {
      title: "List tables",
      description: "On-chain tables with stake range, treasury-backed effective limits (maxOutside, maxStraight) and currentRound { id, status, openedAt, betCount, totalStaked, betsCloseAt (approximate) } or null. `operator` says what the round operator is waiting for.",
      inputSchema: {},
      outputSchema,
      annotations: readOnly,
    },
    async () => result(await get("/tables")),
  );

  server.registerTool(
    "get_table",
    { title: "Get table", description: 'One table by its on-chain id (e.g. "1"). Poll this to see when a round opens.', inputSchema: { id: tableId }, outputSchema, annotations: readOnly },
    async ({ id }) => result(await get(`/tables/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    "get_treasury",
    { title: "Treasury", description: "CasinoTreasury snapshot in chip units (with wei and peg-derived USD): bankroll, reserves, available bankroll, per-round exposure cap, solvency.", inputSchema: {}, outputSchema, annotations: readOnly },
    async () => result(await get("/treasury")),
  );

  server.registerTool(
    "get_limits",
    {
      title: "Limits",
      description: "Largest stake the treasury backs for a payout multiplier right now (35 straight, 17 split, 11 street, 8 corner, 5 six-line, 2 dozen/column, 1 even-money), in whole chip units.",
      inputSchema: { multiplier: z.number().int().min(1).max(65535).default(35), existingLiability: z.number().int().nonnegative().optional().describe("Net liability the round already reserves, chip units") },
      outputSchema,
      annotations: readOnly,
    },
    async ({ multiplier, existingLiability }) => result(await get("/limits", { multiplier, existingLiability })),
  );

  server.registerTool(
    "list_rewards",
    { title: "Rewards", description: "Reward vault assets with on-chain status (AVAILABLE / LOW / UNAVAILABLE), inventory in token units, posted oracle price, price age and staleness. Only AVAILABLE or LOW assets can be claimed.", inputSchema: {}, outputSchema, annotations: readOnly },
    async () => result(await get("/rewards")),
  );

  server.registerTool(
    "list_prices",
    { title: "Oracle prices", description: "USD prices last posted to the on-chain oracle for reward assets, with timestamp, age and a stale flag.", inputSchema: {}, outputSchema, annotations: readOnly },
    async () => result(await get("/prices")),
  );

  server.registerTool(
    "list_rounds",
    {
      title: "List rounds",
      description: "Rounds settled inside the scanned block window (about the last 100 minutes), newest first, with fairness proofs. An empty list is normal on a quiet table; older rounds are readable with get_round.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(20), cursor: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional().describe("Return rounds with roundId below this (nextCursor)"), table: tableId.optional() },
      outputSchema,
      annotations: readOnly,
    },
    async ({ limit, cursor, table }) => result(await get("/rounds", { limit, cursor, table })),
  );

  server.registerTool(
    "get_round",
    {
      title: "Get round",
      description: "One round by id: status, result, bets, staked/returned, commitment, seeds and block reference once revealed, `verified`, and a ready-to-send verify body.",
      inputSchema: { roundId },
      outputSchema,
      annotations: readOnly,
    },
    async ({ roundId }) => result(await get(`/rounds/${roundId}`)),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Stats",
      description: "Outcome counts and chip units staked/returned over rounds settled inside the scanned block window (the window is stated in the response). Not a prediction signal: every spin is independent.",
      inputSchema: { table: tableId.optional(), window: z.number().int().min(1).max(480).default(100) },
      outputSchema,
      annotations: readOnly,
    },
    async ({ table, window }) => result(await get("/stats", { table, window })),
  );

  server.registerTool(
    "verify_round",
    {
      title: "Verify round",
      description: "Recompute keccak256(serverSeed) vs commitment and derive the pocket from (serverSeed, playerSeed, blockRef, uint256 roundId). Pure maths over your input. Returns commitOk, derivedResult, resultOk, verified.",
      inputSchema: { roundId, commitment: hex32, serverSeed: hex32, playerSeed: hex32, blockRef: hex32, result: z.number().int().min(0).max(36).optional() },
      outputSchema,
      annotations: readOnly,
    },
    async (args) => result(await post("/verify", args)),
  );

  server.registerTool(
    "quote_bets",
    {
      title: "Quote bets",
      description: "Validate a bet set and run the check the contract runs before accepting it: per-bet payout, total wager, worst-case liability and whether the round's whole bet set fits under the treasury's per-round cap. Returns accepted, limit.reason and limit.code.",
      inputSchema: { bets, table: tableId.optional().describe("Apply this table's stake range and its open round's existing bets"), roundId: roundId.optional().describe("Quote against this round instead of the table's current one") },
      outputSchema,
      annotations: readOnly,
    },
    async (args) => result(await post("/quote", args)),
  );

  server.registerTool(
    "build_enter_table_intent",
    {
      title: "Build enter-table transaction",
      description:
        "UNSIGNED RouletteGame.enterTable(ids, amounts) that moves chips from your wallet into table escrow. Chips are selected from your on-chain balances (largest denomination first). If the one-time Chip1155 approval is missing it is returned in `prerequisites`: sign that first. Errors: NO_CHIPS, INSUFFICIENT_CHIPS, PAUSED.",
      inputSchema: {
        address,
        units: z.number().int().positive().optional().describe("Chip units to escrow. Omit (and omit chips) to escrow every chip in the wallet."),
        chips: z
          .array(z.object({ denomination: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(25), z.literal(50), z.literal(100)]), count: z.number().int().positive() }))
          .min(1)
          .max(6)
          .optional()
          .describe("Alternatively name exact chips by denomination (not together with units)."),
      },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/enter-table", args)),
  );

  server.registerTool(
    "build_place_bets_intent",
    {
      title: "Build place-bets transaction",
      description:
        "UNSIGNED RouletteGame.placeBets(roundId, bets[]). The round must be Open on chain (omit roundId to use the table's current open round), the total stake must be within your table escrow, and the set must pass the treasury limit. Errors: ROUND_NOT_OPEN, INSUFFICIENT_ESCROW, TABLE_LIMIT, PAUSED. Sign promptly: the betting window is about 45 s.",
      inputSchema: { address, bets: intBets, roundId: roundId.optional(), table: tableId.optional().describe("Defaults to the default table") },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/place-bets", args)),
  );

  server.registerTool(
    "build_leave_table_intent",
    {
      title: "Build leave-table transaction",
      description: "UNSIGNED RouletteGame.leaveTable(units) that mints escrowed chip units back to your wallet. Omit units to withdraw the whole escrow. Error: INSUFFICIENT_ESCROW.",
      inputSchema: { address, units: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).optional() },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/leave-table", args)),
  );

  server.registerTool(
    "build_claim_intent",
    {
      title: "Build claim transaction",
      description:
        "UNSIGNED RewardVault.claimAs(asset, usdAmount, minOut, deadline) that converts win balance into a reward asset. minOut comes from the live vault quote minus slippage; the deadline defaults to 10 minutes. Errors: ASSET_UNAVAILABLE (no inventory, stale price, not enabled), INSUFFICIENT_WIN_BALANCE, PAUSED. Stock Token settlement is jurisdiction-gated.",
      inputSchema: {
        address,
        asset: z.string().min(1).describe("ERC-20 address, registry id (crypto-cashcat) or symbol (CASHCAT); see list_rewards"),
        usdAmount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,18})?$/)]).describe("USD amount of win balance"),
        slippageBps: z.number().int().min(0).max(5000).optional().describe("Slippage tolerance in bps (default 50 = 0.5%)"),
        minOut: z.string().regex(/^\d+$/).optional().describe("Override the minimum token base units instead of deriving it from the quote"),
        deadlineMinutes: z.number().int().min(1).max(1440).optional().describe("Minutes until the claim expires (default 10)"),
      },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/claim", args)),
  );

  return server;
}

// Start only when executed directly (bun/node), not when imported by tests.
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]!);
if (isMain) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`roulette-protocol MCP server ready (API: ${BASE})`);
}
