#!/usr/bin/env bun
/**
 * Smoke test: spawns the MCP server over stdio, lists tools, then calls
 * get_health and quote_bets against a running dev server (ROULETTE_API_URL,
 * default http://localhost:3000). Exits non-zero on any failure.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "src", "index.ts");
const apiUrl = process.env.ROULETTE_API_URL ?? "http://localhost:3000";

const EXPECTED_TOOLS = [
  "get_health",
  "list_tables",
  "get_table",
  "get_treasury",
  "get_limits",
  "list_rewards",
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
const client = new Client({ name: "roulette-smoke", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`tools (${names.length}): ${names.join(", ")}`);
for (const t of EXPECTED_TOOLS) if (!names.includes(t)) fail(`missing tool ${t}`);

type Structured = { ok: boolean; demo?: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };

const health = (await client.callTool({ name: "get_health", arguments: {} })).structuredContent as Structured | undefined;
if (!health?.ok) fail(`get_health → ${JSON.stringify(health?.error ?? health)}. Is the dev server running at ${apiUrl}?`);
const chain = health.data?.chain as { id: number; name: string } | undefined;
console.log(`get_health ok · ${chain?.name} (${chain?.id}) · demo=${health.demo} · version=${String(health.data?.version)}`);

const quote = (await client.callTool({ name: "quote_bets", arguments: { bets: [{ betId: "red", stake: 10 }, { betId: "straight:17", stake: 1 }], table: "neon-01" } })).structuredContent as Structured | undefined;
if (!quote?.ok) fail(`quote_bets → ${JSON.stringify(quote?.error ?? quote)}`);
const q = quote.data as { accepted: boolean; totalWager: number; maximumLiability: { maxNetPayout: number }; limit: { maxRoundExposure: number; reason: string | null } };
console.log(`quote_bets ok · wager=${q.totalWager} · maxNetPayout=${q.maximumLiability.maxNetPayout} · cap=${q.limit.maxRoundExposure} · accepted=${q.accepted}`);
if (q.totalWager !== 11) fail(`unexpected totalWager ${q.totalWager}`);

const over = (await client.callTool({ name: "quote_bets", arguments: { bets: [{ betId: "straight:0", stake: 10 }] } })).structuredContent as Structured | undefined;
const overData = over?.data as { accepted: boolean; limit: { reason: string | null } } | undefined;
if (!over?.ok || overData?.accepted !== false || overData?.limit.reason !== "Table limit reached") fail(`expected 'Table limit reached', got ${JSON.stringify(overData?.limit)}`);
console.log(`quote_bets over-limit ok · reason="${overData.limit.reason}"`);

const intent = (await client.callTool({ name: "build_place_bets_intent", arguments: { roundId: 120500, bets: [{ betId: "red", stake: 10 }] } })).structuredContent as (Structured & { preview?: { intent?: { to: string | null; data: string } } }) | undefined;
const built = intent?.ok ? (intent.data as { intent: { to: string | null; data: string } }).intent : intent?.preview?.intent;
if (!built?.data?.startsWith("0x")) fail(`build_place_bets_intent → ${JSON.stringify(intent?.error ?? intent)}`);
console.log(`build_place_bets_intent ok · to=${built.to ?? "null (preview, contracts not deployed)"} · calldata=${built.data.slice(0, 10)}… · never signed here`);

await client.close();
console.log("smoke: all checks passed");
