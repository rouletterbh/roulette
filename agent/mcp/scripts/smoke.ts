#!/usr/bin/env bun
/**
 * Smoke test: spawns the MCP server over stdio, lists tools, then exercises the read,
 * quote and intent tools against a running API (ROULETTE_API_URL, default the
 * production site). Read-only: nothing is signed or sent. Exits non-zero on failure.
 *
 *   SMOKE_ADDRESS   wallet address used for the intent preflight (default: the zero-balance check address below)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_API_URL } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "src", "index.ts");
const apiUrl = process.env.ROULETTE_API_URL || DEFAULT_API_URL;
const address = process.env.SMOKE_ADDRESS ?? "0x000000000000000000000000000000000000dEaD";

const EXPECTED_TOOLS = [
  "get_health",
  "list_tables",
  "get_table",
  "get_treasury",
  "get_limits",
  "list_rewards",
  "list_prices",
  "list_rounds",
  "get_round",
  "get_stats",
  "verify_round",
  "quote_bets",
  "build_enter_table_intent",
  "build_place_bets_intent",
  "build_leave_table_intent",
  "build_claim_intent",
];

function fail(msg: string): never {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

const transport = new StdioClientTransport({ command: "bun", args: ["run", serverPath], env: { ...process.env, ROULETTE_API_URL: apiUrl } as Record<string, string>, stderr: "pipe" });
const client = new Client({ name: "roulette-smoke", version: "0.2.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`tools (${names.length}): ${names.join(", ")}`);
for (const t of EXPECTED_TOOLS) if (!names.includes(t)) fail(`missing tool ${t}`);

type Structured = { httpStatus?: number; ok: boolean; demo?: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };
const callTool = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })).structuredContent as Structured | undefined;

const health = await callTool("get_health");
if (!health?.ok) fail(`get_health → ${JSON.stringify(health?.error ?? health)}. Is the API reachable at ${apiUrl}?`);
const chain = health.data?.chain as { id: number; name: string; latestBlock?: number } | undefined;
const chainBacked = health.demo === false;
console.log(`get_health ok · ${chain?.name} (${chain?.id}) · ${chainBacked ? `chain-backed, block ${chain?.latestBlock}` : "simulated data"} · version=${String(health.data?.version)}`);

const tables = await callTool("list_tables");
if (!tables?.ok) fail(`list_tables → ${JSON.stringify(tables?.error ?? tables)}`);
const rows = (tables.data?.tables ?? []) as Array<{ id: string; limits: { maxStraight: number; maxOutside: number }; currentRound: { id: number | string; status: string } | null; operator?: string }>;
if (!rows.length) fail("list_tables returned no tables");
const table = rows[0]!;
console.log(`list_tables ok · ${rows.length} table(s) · table ${table.id} · maxOutside=${table.limits.maxOutside} maxStraight=${table.limits.maxStraight} · ${table.currentRound ? `round ${table.currentRound.id} ${table.currentRound.status}` : `no round (${table.operator ?? "idle"})`}`);

const quote = await callTool("quote_bets", { bets: [{ betId: "red", stake: 1 }], table: table.id });
if (!quote?.ok) fail(`quote_bets → ${JSON.stringify(quote?.error ?? quote)}`);
const q = quote.data as { accepted: boolean; totalWager: number; limit: { maxRoundExposure: number; reason: string | null } };
if (q.totalWager !== 1) fail(`unexpected totalWager ${q.totalWager}`);
console.log(`quote_bets ok · wager=${q.totalWager} · cap=${q.limit.maxRoundExposure} · accepted=${q.accepted}${q.limit.reason ? ` (${q.limit.reason})` : ""}`);

const over = await callTool("quote_bets", { bets: [{ betId: "straight:0", stake: 100000 }] });
const overData = over?.data as { accepted: boolean; limit: { reason: string | null } } | undefined;
if (!over?.ok || overData?.accepted !== false) fail(`expected an over-limit quote to be rejected, got ${JSON.stringify(overData?.limit ?? over?.error)}`);
console.log(`quote_bets over-limit ok · reason="${overData.limit.reason}"`);

// Intent builders answer with an unsigned transaction or a specific precondition code; both are a pass.
const PRECONDITIONS = ["ROUND_NOT_OPEN", "INSUFFICIENT_ESCROW", "NO_CHIPS", "INSUFFICIENT_CHIPS", "ASSET_UNAVAILABLE", "INSUFFICIENT_WIN_BALANCE", "TABLE_LIMIT", "PAUSED", "CONTRACTS_NOT_DEPLOYED"];
for (const [name, args] of [
  ["build_enter_table_intent", chainBacked ? { address } : { address, chips: [{ denomination: 1, count: 1 }] }],
  ["build_place_bets_intent", { address, bets: [{ betId: "red", stake: 1 }], table: chainBacked ? table.id : undefined, ...(chainBacked ? {} : { roundId: 1 }) }],
  ["build_leave_table_intent", { address, ...(chainBacked ? {} : { units: 1 }) }],
] as const) {
  const r = await callTool(name, args as Record<string, unknown>);
  if (r?.ok) {
    const intent = (r.data as { intent: { to: string | null; data: string; chainId: number } }).intent;
    if (!intent?.data?.startsWith("0x") || !intent.to) fail(`${name} returned a malformed intent`);
    console.log(`${name} ok · unsigned tx to=${intent.to} chainId=${intent.chainId} calldata=${intent.data.slice(0, 10)}… · never signed here`);
  } else if (r?.error && PRECONDITIONS.includes(r.error.code)) {
    console.log(`${name} ok · ${r.error.code}: ${r.error.message}`);
  } else {
    fail(`${name} → ${JSON.stringify(r?.error ?? r)}`);
  }
}

await client.close();
console.log("smoke: all checks passed");
