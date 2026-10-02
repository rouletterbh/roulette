# Roulette protocol MCP server

An MCP (Model Context Protocol) server that exposes the agent-ready REST API of a social roulette club built on Robinhood Chain. It lets any MCP-capable agent **read** public state, **verify** commit–reveal fairness proofs, **quote** bets against the treasury limit and **build unsigned transaction intents**.

It never holds keys and never signs. The `build_*` tools return calldata (`to`, `chainId`, `data`, ABI, description, warnings) that the agent's own wallet must review and sign. Agents are bound by the same age, jurisdiction and responsible-play gates as human players.

Independent product built on Robinhood Chain. Not affiliated with, endorsed by or operated by Robinhood. The API is in beta and demo-backed until the contracts deploy; every response from demo data carries `demo: true`.

## Requirements

- [bun](https://bun.sh) 1.x
- A running instance of the web app (`bun run dev` in the repo root serves `http://localhost:3000`)

```sh
cd agent/mcp
bun install
```

## Run

```sh
ROULETTE_API_URL=http://localhost:3000 bun run start
```

The server speaks MCP over stdio. `ROULETTE_API_URL` defaults to `http://localhost:3000`.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "roulette": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/repo/agent/mcp/src/index.ts"],
      "env": { "ROULETTE_API_URL": "http://localhost:3000" }
    }
  }
}
```

### Generic MCP client (stdio)

```json
{ "command": "bun", "args": ["run", "agent/mcp/src/index.ts"], "env": { "ROULETTE_API_URL": "https://<host>" } }
```

## Tools

| Tool | Calls | Purpose |
| --- | --- | --- |
| `get_health` | `GET /api/v1/health` | Chain, demo mode, deployment status, version |
| `list_tables` | `GET /api/v1/tables` | Tables with effective limits |
| `get_table` | `GET /api/v1/tables/{id}` | One table |
| `get_treasury` | `GET /api/v1/treasury` | Solvency snapshot, available bankroll, per-round cap, collateralization |
| `get_limits` | `GET /api/v1/limits` | Max safe stake for a payout multiplier |
| `list_rewards` | `GET /api/v1/rewards` | Reward inventory and statuses |
| `list_rounds` | `GET /api/v1/rounds` | Settled rounds with fairness proofs (cursor paginated) |
| `get_round` | `GET /api/v1/rounds/{id}` | One round plus a ready verify body |
| `get_stats` | `GET /api/v1/stats` | Descriptive outcome counts (not a signal) |
| `verify_round` | `POST /api/v1/verify` | Recompute commitment and result |
| `quote_bets` | `POST /api/v1/quote` | Pre-acceptance limit check |
| `build_enter_table_intent` | `POST /api/v1/intents/enter-table` | Unsigned `enterTable` + approval prerequisite |
| `build_place_bets_intent` | `POST /api/v1/intents/place-bets` | Unsigned `placeBets` (quoted first) |
| `build_leave_table_intent` | `POST /api/v1/intents/leave-table` | Unsigned `leaveTable` |
| `build_claim_intent` | `POST /api/v1/intents/claim` | Unsigned `RewardVault.claimAs` |

Every tool returns the API envelope as `structuredContent` (`{ httpStatus, ok, demo, data | error, preview? }`) and a text rendering of the same. Validation and limit rejections are returned as data, not as tool errors, so the agent can read the reason. When contracts are not deployed, `build_*` tools return `error.code = "CONTRACTS_NOT_DEPLOYED"` with the fully encoded intent under `preview` (`to: null`).

## Smoke test

With the web app running:

```sh
bun run smoke
```

Spawns the server, lists tools, calls `get_health`, `quote_bets` (accepted and over-limit) and `build_place_bets_intent`, and exits non-zero on any failure.

## Design notes

- Thin client by design: limits, encodings and proofs live in one place (the web app's `src/lib/agent` and `src/lib/fairness`), so the MCP server cannot drift from the REST API or the contracts.
- Full API reference: `GET /api/v1/openapi.json`. Dataset catalog: `GET /api/v1/datasets`. Human docs: `/developers`.
