# Roblette MCP server

An MCP (Model Context Protocol) server that gives an AI agent a seat at Roblette, onchain roulette on Robinhood Chain. It exposes the product's REST API (`/api/v1`) as tools: **read** live contract state, **verify** commit–reveal fairness proofs, **quote** bets against the treasury limit and **build unsigned transactions**.

The API reads the deployed contracts on Robinhood Chain (chain id 4663). Tables, rounds, treasury, reward inventory and prices come from chain; when the chain cannot be read a tool returns `CHAIN_UNAVAILABLE` rather than substitute data.

It never holds keys and never signs. The `build_*` tools take your wallet address, check your on-chain balances, and return a transaction (`to`, `data`, `value`, `chainId`) that your own wallet must review and sign. Agents are bound by the same age, jurisdiction and responsible-play gates as human players.

Independent product built on Robinhood Chain. Not affiliated with, endorsed by or operated by Robinhood. Contracts are not yet audited. The wheel keeps 1/37 of every bet on average; nothing here improves the odds.

## Requirements

- [bun](https://bun.sh) 1.x

```sh
cd agent/mcp
bun install
```

## Run

```sh
bun run start
```

The server speaks MCP over stdio and calls the production site, `https://roulette-three-blond.vercel.app`, by default. Set `ROULETTE_API_URL` to point it somewhere else (for example `http://localhost:3000` while developing the web app).

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "roulette": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/repo/agent/mcp/src/index.ts"]
    }
  }
}
```

### Generic MCP client (stdio)

```json
{ "command": "bun", "args": ["run", "agent/mcp/src/index.ts"], "env": { "ROULETTE_API_URL": "https://roulette-three-blond.vercel.app" } }
```

## What an agent can do, end to end

Everything is in whole **chip units** (one unit costs 0.00003 ETH and is pegged at $0.10; USD figures in responses are derived from that peg). The agent needs its own wallet on Robinhood Chain holding chips (bought with `CasinoTreasury.deposit()` in the web app's cashier) and a little ETH for gas.

1. **Read the tables.** `list_tables` returns each on-chain table (`"1"` today) with its stake range, the limits the treasury backs right now, and `currentRound`. `currentRound: null` with `operator: "waiting-for-players"` is normal: rounds open only while someone has chips in table escrow.
2. **Quote.** `quote_bets` with `{ bets: [{ betId: "red", stake: 5 }], table: "1" }` runs the same check the contract runs and says whether the set would be accepted, and why not if not.
3. **Take a seat.** `build_enter_table_intent` with `{ address }` (optionally `units`) selects chips from the wallet and returns an unsigned `enterTable` transaction. If the one-time chip approval is missing it comes first in `prerequisites`. **Sign with your own wallet** and wait for inclusion. With chips in escrow, the operator opens a round.
4. **Bet.** Poll `get_table` until `currentRound.status` is `Open`, then `build_place_bets_intent` with `{ address, bets }`. It checks the round is open, the stake fits your escrow and the set fits the treasury limit, and returns an unsigned `placeBets` transaction. Sign promptly: the betting window is about 45 seconds (`betsCloseAt` is approximate, it is not stored on chain).
5. **Verify the round.** After the reveal, `get_round` returns the commitment, seeds, block reference, result and `verified`. Pass its `verify.body` to `verify_round` to recompute the result yourself: `keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ uint256(roundId)) mod 37`.
6. **Leave.** `build_leave_table_intent` with `{ address }` returns an unsigned `leaveTable` for the whole escrow (winnings included). The chips are back in the wallet; from there they can be redeemed for ETH in the web app's cashier, or collected as reward assets:
7. **Collect (two steps, the first is one-way).** `build_convert_to_rewards_intent` with `{ address, units }` returns an unsigned `CasinoTreasury.convertToRewards` that burns wallet chips and credits their USD value at the chip peg to a win balance on the reward vault (approval in `prerequisites` when missing). **A win balance cannot be turned back into chips or withdrawn as ETH**; it can only be claimed. Its `claimableAfter` list and `warnings` say what the vault could pay right now. Then `build_claim_intent` with `{ address, asset, usdAmount }` returns an unsigned `RewardVault.claimAs`; `maxClaimableNow` is `min(win balance, vault inventory × posted price)`. The vault is restocked in batches from the treasury's reward buckets, so `INSUFFICIENT_INVENTORY` (with `details.available`) means wait or pick another asset: the win balance is not lost.

When a precondition is not met you get a specific code instead of a transaction: `ROUND_NOT_OPEN`, `INSUFFICIENT_ESCROW`, `NO_CHIPS`, `INSUFFICIENT_CHIPS`, `ASSET_UNAVAILABLE`, `INSUFFICIENT_INVENTORY`, `INSUFFICIENT_WIN_BALANCE`, `TABLE_LIMIT`, `PAUSED`. Simulate every transaction (`eth_call` / `eth_estimateGas`) before broadcasting; state can change between the preflight and your signature.

## Tools

| Tool | Calls | Purpose |
| --- | --- | --- |
| `get_health` | `GET /api/v1/health` | Chain id, latest block, contract addresses, pause flags, treasury solvency, operator liveness |
| `list_tables` | `GET /api/v1/tables` | On-chain tables, effective limits, current round |
| `get_table` | `GET /api/v1/tables/{id}` | One table by numeric id (`"1"`) |
| `get_treasury` | `GET /api/v1/treasury` | Bankroll, reserves, available bankroll, per-round cap, solvency |
| `get_limits` | `GET /api/v1/limits` | Max stake the treasury backs for a payout multiplier |
| `list_rewards` | `GET /api/v1/rewards` | Reward vault assets: status, inventory, posted price and its age |
| `list_prices` | `GET /api/v1/prices` | Prices posted to the on-chain oracle |
| `list_rounds` | `GET /api/v1/rounds` | Rounds settled inside the scanned block window, with proofs |
| `get_round` | `GET /api/v1/rounds/{id}` | One round, its bets and a ready verify body |
| `get_stats` | `GET /api/v1/stats` | Outcome counts over settled rounds in the block window (not a signal) |
| `verify_round` | `POST /api/v1/verify` | Recompute commitment and result |
| `quote_bets` | `POST /api/v1/quote` | Pre-acceptance limit check |
| `build_enter_table_intent` | `POST /api/v1/intents/enter-table` | Unsigned `enterTable` (+ approval when missing). Takes `address` |
| `build_place_bets_intent` | `POST /api/v1/intents/place-bets` | Unsigned `placeBets` for the open round. Takes `address` |
| `build_leave_table_intent` | `POST /api/v1/intents/leave-table` | Unsigned `leaveTable`. Takes `address` |
| `build_convert_to_rewards_intent` | `POST /api/v1/intents/convert-to-rewards` | Unsigned `CasinoTreasury.convertToRewards` (+ approval when missing): wallet chips → USD win balance, one-way. Takes `address` |
| `build_claim_intent` | `POST /api/v1/intents/claim` | Unsigned `RewardVault.claimAs` with `minOut` and deadline, plus `maxClaimableNow`. Takes `address` |

Every tool returns the API envelope as `structuredContent` (`{ httpStatus, ok, demo, data | error }`) and a text rendering of the same. `demo` is `false` when the answer was read from chain. Validation, limit and precondition failures are returned as data, not as tool errors, so the agent can read the reason; only 5xx responses (including `CHAIN_UNAVAILABLE`) are tool errors.

## Smoke test

```sh
bun run smoke                                   # against the production site
ROULETTE_API_URL=http://localhost:3000 bun run smoke
```

Spawns the server, lists tools, calls `get_health`, `list_tables`, `quote_bets` (accepted and over-limit) and the three table intents, and exits non-zero on any failure. It is read-only: it signs and sends nothing. `SMOKE_ADDRESS` sets the wallet used for the intent preflight.

## Design notes

- Thin client by design: limits, encodings and proofs live in one place (the web app's `src/lib/agent`, `src/lib/web3/server.ts` and `src/lib/fairness`), so the MCP server cannot drift from the REST API or the contracts.
- Full API reference: `GET /api/v1/openapi.json`. Dataset catalog: `GET /api/v1/datasets`. Human docs: `/developers`.
