#!/usr/bin/env bun
/**
 * MCP server for the roulette protocol's agent-ready REST API (built on Robinhood Chain).
 *
 * Thin client: every tool calls /api/v1 and returns the JSON envelope as structured
 * content. It never holds keys and never signs; the `build_*` tools return UNSIGNED
 * transaction intents that the agent's own wallet must review and sign.
 *
 *   ROULETTE_API_URL   base URL of the web app (default http://localhost:3000)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const API_URL = (process.env.ROULETTE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
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
    lines.push(`ok${body.demo ? " (demo data)" : ""}`);
  } else {
    lines.push(`error ${body.error?.code ?? status}: ${body.error?.message ?? "unknown"}`);
    if (body.preview) lines.push("A preview of the intent is included (contracts not deployed; `to` is null).");
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
const bets = z.array(z.object({ betId, stake: z.number().positive().describe("Stake in chip units") })).min(1).max(64);
const intBets = z.array(z.object({ betId, stake: z.number().int().positive().describe("Stake in whole chip units (uint128)") })).min(1).max(64);
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe("0x-prefixed 32-byte hex");

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const builder = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/* ---------------------------------------------------------------- server */

export function createServer() {
  const server = new McpServer(
    { name: "roulette-protocol", version: "0.1.0" },
    {
      instructions: [
        "Agent-ready interface for a social roulette club built on Robinhood Chain (independent product; not affiliated with Robinhood).",
        "Tools read public state, verify commit-reveal proofs, quote bets against the treasury limit and build UNSIGNED transaction intents.",
        "This server never signs. Hand intents to the user's wallet. Agents are bound by the same age, jurisdiction and responsible-play rules as humans.",
        "Responses with demo=true come from simulated data. Every spin is independent; stats describe the past only.",
      ].join(" "),
    },
  );

  server.registerTool("get_health", { title: "Health", description: "Service, chain (id, name, explorer), demo mode, contract deployment status and API version.", inputSchema: {}, outputSchema, annotations: readOnly }, async () => result(await get("/health")));

  server.registerTool("list_tables", { title: "List tables", description: "All tables with status and effective limits (maxOutside, maxStraight derived from the treasury).", inputSchema: {}, outputSchema, annotations: readOnly }, async () => result(await get("/tables")));

  server.registerTool(
    "get_table",
    { title: "Get table", description: "One table by id (e.g. neon-01).", inputSchema: { id: z.string().min(1) }, outputSchema, annotations: readOnly },
    async ({ id }) => result(await get(`/tables/${encodeURIComponent(id)}`)),
  );

  server.registerTool("get_treasury", { title: "Treasury", description: "Treasury snapshot: bankroll, reserves, available bankroll, per-round exposure cap, collateralization.", inputSchema: {}, outputSchema, annotations: readOnly }, async () => result(await get("/treasury")));

  server.registerTool(
    "get_limits",
    {
      title: "Limits",
      description: "Maximum safe stake for a payout multiplier (35 straight, 17 split, 11 street, 8 corner, 5 six-line, 2 dozen/column, 1 even-money).",
      inputSchema: { multiplier: z.number().int().min(1).max(65535).default(35), existingLiability: z.number().nonnegative().optional() },
      outputSchema,
      annotations: readOnly,
    },
    async ({ multiplier, existingLiability }) => result(await get("/limits", { multiplier, existingLiability })),
  );

  server.registerTool("list_rewards", { title: "Rewards", description: "Reward inventory (crypto and supported Stock Tokens) with liquidity statuses.", inputSchema: {}, outputSchema, annotations: readOnly }, async () => result(await get("/rewards")));

  server.registerTool(
    "list_rounds",
    {
      title: "List rounds",
      description: "Settled rounds with fairness proofs, newest first. Cursor paginated; optional table filter.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(20), cursor: z.number().int().positive().optional(), table: z.string().optional() },
      outputSchema,
      annotations: readOnly,
    },
    async ({ limit, cursor, table }) => result(await get("/rounds", { limit, cursor, table })),
  );

  server.registerTool(
    "get_round",
    { title: "Get round", description: "One round with commitment, seeds, block reference, result and a ready-to-send verify body.", inputSchema: { roundId: z.number().int().nonnegative() }, outputSchema, annotations: readOnly },
    async ({ roundId }) => result(await get(`/rounds/${roundId}`)),
  );

  server.registerTool(
    "get_stats",
    {
      title: "Stats",
      description: "Descriptive color/parity/dozen/column counts over the most recent N rounds. Not a prediction signal: every spin is independent.",
      inputSchema: { table: z.string().optional(), window: z.number().int().min(1).max(480).default(100) },
      outputSchema,
      annotations: readOnly,
    },
    async ({ table, window }) => result(await get("/stats", { table, window })),
  );

  server.registerTool(
    "verify_round",
    {
      title: "Verify round",
      description: "Recompute keccak256(serverSeed) vs commitment and derive the pocket from (serverSeed, playerSeed, blockRef, roundId). Returns commitOk, derivedResult, resultOk.",
      inputSchema: { roundId: z.number().int().nonnegative(), commitment: hex32, serverSeed: hex32, playerSeed: hex32, blockRef: hex32, result: z.number().int().min(0).max(36).optional() },
      outputSchema,
      annotations: readOnly,
    },
    async (args) => result(await post("/verify", args)),
  );

  server.registerTool(
    "quote_bets",
    {
      title: "Quote bets",
      description: "Validate a bet set and run the treasury pre-acceptance check: per-bet payout, total wager, worst-case liability and whether it fits under the per-round cap (accepted / 'Table limit reached').",
      inputSchema: { bets, table: z.string().optional().describe("Apply this table's min/max stake too") },
      outputSchema,
      annotations: readOnly,
    },
    async (args) => result(await post("/quote", args)),
  );

  server.registerTool(
    "build_enter_table_intent",
    {
      title: "Build enter-table intent",
      description: "UNSIGNED RouletteGame.enterTable(ids, amounts) intent that escrows chips, plus the one-time Chip1155.setApprovalForAll prerequisite. You must sign with your own wallet.",
      inputSchema: { chips: z.array(z.object({ denomination: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(25), z.literal(50), z.literal(100)]), count: z.number().int().positive() })).min(1).max(6) },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/enter-table", args)),
  );

  server.registerTool(
    "build_place_bets_intent",
    {
      title: "Build place-bets intent",
      description: "UNSIGNED RouletteGame.placeBets(roundId, bets[]) intent. Bets are quoted first; the response includes maxLiability and the limit check. Fails with TABLE_LIMIT if the set would be rejected.",
      inputSchema: { roundId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]), bets: intBets, table: z.string().optional() },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/place-bets", args)),
  );

  server.registerTool(
    "build_leave_table_intent",
    {
      title: "Build leave-table intent",
      description: "UNSIGNED RouletteGame.leaveTable(units) intent that mints escrowed chip units back to the wallet.",
      inputSchema: { units: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]) },
      outputSchema,
      annotations: builder,
    },
    async (args) => result(await post("/intents/leave-table", args)),
  );

  server.registerTool(
    "build_claim_intent",
    {
      title: "Build claim intent",
      description: "UNSIGNED RewardVault.claimAs(asset, usdAmount, minOut, deadline) intent. asset is an ERC-20 address or registry id (crypto-eth, stock-nvda). Stock Token settlement is jurisdiction-gated.",
      inputSchema: {
        asset: z.string().min(1),
        usdAmount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,18})?$/)]).describe("USD amount of win balance"),
        minOut: z.string().regex(/^\d+$/).optional().describe("Minimum token base units (slippage guard)"),
        deadline: z.number().int().positive().optional().describe("Unix seconds; default now + 20 min"),
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
