# Operator services

Two long-running processes driven by the OPERATOR key. Both are bun + TypeScript + viem, read
`RPC_URL` / `CHAIN_ID` / `OPERATOR_PRIVATE_KEY` from the environment, and never write to a chain
when started with `--dry-run`.

```bash
cd agent/operator && bun install
```

## Price relay (`src/post-prices.ts`)
Keeps `PostedPriceOracle` fresh for CASHCAT, PONS and AI from CoinGecko (platform `robinhood`).

```bash
bun run prices:dry                       # fetch and print, no chain writes
ORACLE_ADDRESS=0x… OPERATOR_PRIVATE_KEY=0x… RPC_URL=https://rpc.mainnet.chain.robinhood.com bun run prices
```

Posts every `INTERVAL_SEC` (default 300s; the vault's staleness window is 900s, so two misses are tolerated). Moves above `MAX_DEVIATION_BPS` (default 20%) are skipped and logged; an ADMIN acknowledges with `forcePrice`. Run it under a supervisor (systemd, Railway, Fly) with the key in a secret store.

## Round operator (`src/run-rounds.ts`)

Drives the roulette round lifecycle for one or more tables, forever (or for `--rounds=N`).

```bash
bun run rounds:dry                                   # verify config + roles, print the plan, send nothing
GAME_ADDRESS=0x4d02F58D9e3e0CccaD49dB18ed0609661d61B94A \
RANDOMNESS_ADDRESS=0xd57Fa0Bb23E43C1Ad872e82BB8D5c5D1A03C3e76 \
OPERATOR_PRIVATE_KEY=0x… RPC_URL=https://rpc.mainnet.chain.robinhood.com CHAIN_ID=4663 \
bun run rounds
```

### Lifecycle, one round

| Step | Call | Who | Notes |
|---|---|---|---|
| 0 | persist `{roundId, tableId, seed, commitment, stage: planned}` to `state/rounds.json` | operator process | before anything is sent, so the seed survives a crash |
| 1 | `RandomnessManager.commit(roundId, keccak256(seed))` | OPERATOR | `roundId` can be committed once, ever |
| 2 | `RouletteGame.openRound(roundId, tableId)` | OPERATOR | reverts unless committed, table active, bankroll >= `minBankrollToOpenUnits`, gameplay not paused |
| 3 | wait `BETTING_SECONDS` | — | players call `placeBets`; every bet is folded into `playerSeed` |
| 4a | `RouletteGame.closeRound(roundId)` | OPERATOR | the game itself calls `RandomnessManager.lock(roundId, playerSeed)`; `revealAfterBlock = block + revealDelayBlocks` (2 on mainnet) |
| 4b | `RouletteGame.cancelRound(roundId)` when `betCount == 0` | OPERATOR | default no-bet path, see below |
| 5 | wait until `block.number > revealAfterBlock` | — | polled every `POLL_MS` |
| 6 | `RandomnessManager.reveal(roundId, seed)` | OPERATOR | result = `keccak256(seed ‖ playerSeed ‖ blockhash(revealAfterBlock) ‖ roundId) mod 37`; the operator re-derives it locally and logs `localResult` |
| 7 | `RouletteGame.settleRound(roundId)` | anyone (we send it) | pays winners from the reservation, releases it on the treasury |

**No-bet rounds.** `EMPTY_ROUND_POLICY=cancel` (default): one transaction, `cancelRound`, which marks the
game round `Voided` with reason "cancelled by operator before close" and leaves the randomness round
`Committed` (never locked; the id is simply consumed). `EMPTY_ROUND_POLICY=settle`: close → reveal →
settle (three transactions) so the chain shows a result for every round, at ~3x the gas. Cancel is the
cheapest valid path and is the default.

**Reveal window missed.** `blockhash` is only available for 256 blocks. If the operator is down for longer
than that after a close, the next start sees `block > revealAfterBlock + 256` and sends
`RouletteGame.voidRound(roundId)` (one tx: `markVoid` on the randomness source + refund of every stake).
If `reveal` itself lands too late it voids the randomness round instead of reverting; `settleRound` then
refunds (the operator handles both, logging `round.revealVoided` / `round.voided` at error level).

**Restarts.** Every decision is taken from chain state (`RouletteGame.getRound` + `RandomnessManager.getRound`),
the local file only supplies the seed and the round counter. On start, any record whose stage is not
`settled | cancelled | voided` is resumed from wherever the chain says it is (`round.resume` log line), including
rounds for tables that are no longer in `TABLE_IDS`. The counter is bumped past any id already used onchain.

**Transactions.** One in flight at a time across all tables (serialised, so the pending nonce is always right).
Each step is retried with exponential backoff (1s → `MAX_BACKOFF_MS`, default 30s) after re-reading chain
state, so a timed-out receipt or a "nonce too low" never double-sends: the re-decision sees the landed tx.
Hashes are recorded per step in `rounds.json` and awaited before a step is re-sent.

**Shutdown.** First SIGINT/SIGTERM: stop opening new rounds, finish in-flight ones (the betting window
still runs its course), exit 0. Second SIGINT: exit immediately; state is on disk and the next start resumes.

### Env

| Var | Default | Meaning |
|---|---|---|
| `RPC_URL` | mainnet RPC | JSON-RPC endpoint |
| `CHAIN_ID` | `4663` | must match the RPC (checked at start) |
| `GAME_ADDRESS`, `RANDOMNESS_ADDRESS` | required | `RouletteGame.RANDOMNESS()` must equal `RANDOMNESS_ADDRESS` (checked) |
| `OPERATOR_PRIVATE_KEY` | required unless `--dry-run` | must hold `OPERATOR_ROLE` on `RouletteGame.ACL()` (checked, fail fast) |
| `ACL_ADDRESS` | `game.ACL()` | override only if needed |
| `TABLE_IDS` | `1` | comma list; each must be active |
| `BETTING_SECONDS` | `45` | betting window per round (a human needs time to notice the round, sign in a wallet and get included) |
| `SEATED_ONLY` | `true` | open rounds only while at least one player has chips in escrow (`EscrowDeposited` logs re-checked against `escrow(player)`); otherwise just watch, sending nothing |
| `SEAT_POLL_MS` | `5000` | how often to re-check seats while waiting |
| `SCAN_FROM_BLOCK` | latest − 50000 | first block to scan for `EscrowDeposited` on the first start (mainnet: the RouletteGame deployment block 78563886); progress is persisted in `state/seats.json` |
| `SCAN_CHUNK_BLOCKS` | `50000` | `eth_getLogs` range per request (halves automatically if the RPC rejects it; progress is saved per chunk) |
| `ROUND_GAP_SECONDS` | `3` | pause between rounds on a table |
| `IDLE_GAP_SECONDS` | `60` | cap on the pause after empty rounds (doubles per empty round from `ROUND_GAP_SECONDS`, resets on the first round with bets) |
| `EMPTY_ROUND_POLICY` | `cancel` | `cancel` or `settle`, see above |
| `MAX_ROUNDS` / `--rounds=N` | `0` (forever) | rounds per table, then exit |
| `STATE_DIR` | `agent/operator/state` | where `rounds.json` / `status.json` live |
| `POLL_MS` | `1000` | block / receipt polling interval |
| `TX_TIMEOUT_MS` | `120000` | receipt wait before the step is retried |
| `MAX_BACKOFF_MS` | `30000` | cap for the retry delay |

### State files

- `state/rounds.json` — `{ version, nextRoundId, rounds: { [roundId]: { roundId, tableId, seed, commitment, stage, closesAt, revealAfterBlock, betCount, result, txs } } }`.
  **Contains server seeds**: it is the only copy of the entropy needed to reveal a locked round. Keep it on
  persistent disk, back it up, never commit it (`.gitignore` covers it). Losing it for a round that is already
  `closed` means that round can only be voided after 256 blocks. Terminal rounds are pruned beyond the last 200.
- `state/status.json` — poll-friendly snapshot for a frontend: `{ updatedAt, chainId, operator, tables: { [tableId]: { roundId, stage, closesAt, revealAfterBlock, betCount, lastResult } }, recent: [...] }`.

Logs are JSON lines, one per transition: `round.planned`, `round.committed`, `round.opened`, `round.closed`,
`round.cancelled`, `round.revealed`, `tx.settled`, `round.settled`, `round.voided`, `round.resume`, `step.failed`,
each carrying `roundId`, `tableId`, `tx`, `block` where applicable.

### Failure modes

| Symptom | Cause | What happens / what to do |
|---|---|---|
| exits at start: `does NOT hold OPERATOR_ROLE` | key not granted, or OPERATOR == deployer (Deploy.s.sol revokes the deployer's temporary OPERATOR_ROLE after creating table 1) | ADMIN calls `AccessController.grantRole(OPERATOR_ROLE, operator)` |
| exits at start: chain id / RANDOMNESS mismatch | wrong env | fix env |
| `step.failed` with `InsufficientBankrollToOpen` | house equity below `minBankrollToOpenUnits` | retried with backoff until `fundBankroll` |
| `step.failed` with `EnforcedPause`/paused | PAUSE_GAMEPLAY set | openRound keeps retrying; closing/revealing/settling of in-flight rounds are not pausable and proceed |
| `round.voided` (error level) | operator was down > 256 blocks after a close | stakes refunded; investigate the outage |
| `operator.lowBalance` warning | < 0.001 ETH for gas | top up the operator address |
| round stuck Open with the operator dead > `roundTimeout` (1 day) | — | anyone can `voidRound`; players are never trapped |

### Supervision

Run exactly one instance per operator key (two instances would race on nonces and roundIds). Restart on
exit; the process resumes from `state/`. systemd example:

```ini
[Service]
WorkingDirectory=/srv/roulette/agent/operator
EnvironmentFile=/etc/roulette/operator.env     # OPERATOR_PRIVATE_KEY etc., mode 0600
ExecStart=/usr/local/bin/bun run src/run-rounds.ts
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=120                              # long enough to finish an in-flight round
StateDirectory=roulette-operator                # and set STATE_DIR=/var/lib/roulette-operator
```

On Fly/Railway: one machine, `min_machines_running = 1`, a persistent volume mounted at `STATE_DIR`, the
key in the platform secret store, `kill_signal = "SIGINT"`, `kill_timeout = 120`. Scrape `state/status.json`
or the JSON logs for alerting (`level: "error"` lines, and `stage` not changing for longer than
`BETTING_SECONDS + revealDelay * blockTime + a minute`).

## Tests

```bash
bun test            # from agent/operator; needs Foundry in ~/.foundry/bin
```

`test/anvil.e2e.ts` (picked up through `test/anvil.e2e.test.ts`) starts `anvil` on a free port, deploys with
`contracts/script/Deploy.s.sol` (anvil account 0 as ADMIN/PAUSER/TREASURER, account 2 as OPERATOR, 0.1 ETH
bankroll, 1e14 wei chips), asserts the operator refuses to run with a key lacking OPERATOR_ROLE, dry-runs,
then runs two rounds with `BETTING_SECONDS=2` while anvil account 1 deposits, enters the table and bets
1 unit on red each round. It checks both rounds settle with a result in 0..36, the player's escrow moved by
exactly ±1 per round, `RandomnessManager.verify(roundId)` is true, the treasury is solvent with no leftover
reservation, and the state/status files are consistent. ~15s. It writes `contracts/broadcast/Deploy.s.sol/31337/`
(gitignored). Nothing ever touches a public RPC.

## Reward fulfilment (`bun run convert`)

The vault is funded by players, never by the founders. Two treasury ETH buckets pay for reward tokens:

| Bucket | Filled by | Drawn with (TREASURER_ROLE) |
|---|---|---|
| `claimable` | `convertToRewards`: the ETH that backed chips a player turned into a win balance. Owed to players as rewards | `CasinoTreasury.fundRewards(to, amount)` |
| `rewardInventory` | 20% of every deposit | `CasinoTreasury.withdrawRewardInventory(to, amount)` |

`src/convert-inventory.ts` turns them into reward tokens held by the vault:

1. draw the bucket(s) to the treasurer wallet (`SOURCE=both` by default; `claimable` or `inventory` to restrict)
2. Uniswap v3 `SwapRouter02.exactInputSingle{value}` ETH → asset, per asset, best fee tier by `QuoterV2`
3. `asset.approve(vault)` + `RewardVault.fundInventory(asset, amount)`

**The key must hold `TREASURER_ROLE`.** The run prints the role it needs and refuses without it. A dry run needs no key.
The hosted hot key (`OPERATOR_ROLE` only) cannot run this.

**Sizing.** First buy what covers the win balances players already hold: target per asset =
`RewardVault.totalWinBalance ÷ number of enabled assets`, valued at the posted oracle price, minus what the vault
already holds of that asset, floored at 0 (an asset the vault is long on does not offset another's shortfall, because
a player may claim the whole balance as any one asset). The budget fills those shortfalls first, pro rata to the
shortfall when it cannot cover them all; whatever is left is split by `WEIGHTS` as before. Shortfalls are grossed up by
`SLIPPAGE_BPS` so a fill at the minimum output still covers.

Example (ETH $2,670, empty vault, a player converted 50 chips → $5.00 win balance, `claimable` 0.0015 ETH,
`rewardInventory` 0.000857 ETH): target $1.6667 per asset → shortfall $1.6667 each = 0.000624 ETH each, 0.001873 ETH in
all (0.001892 ETH with 1% slippage headroom). `fundRewards(0.0015 ETH)` covers 80%; the inventory bucket is below its
0.004 ETH floor, so only the missing 0.000392 ETH is drawn from it as a top-up. Each asset gets 0.000631 ETH; nothing is
left for the weighted split.

**Floors.** `claimable` is drawn in full once it reaches `MIN_CLAIMABLE_WEI` (0.0005 ETH): it is owed to players. The
whole `rewardInventory` bucket is drawn only at `MIN_INVENTORY_WEI` (0.004 ETH ≈ $10; smaller speculative buys are
not worth gas and slippage); below that, only the part of a win-balance shortfall that `claimable` cannot cover is
drawn. Slices under `MIN_SWAP_WEI` are folded into the largest slice.

**Coverage.** A win balance is USD at the chip peg (`chipUsdValue`, $0.10) while its backing is ETH at the chip price
(`chipPriceWei`, 0.00003 ETH). `claimable` alone covers a converted chip only above ETH = `chipUsdValue ÷ chipPriceWei`
= $3,333.33; together with the deposit's reward share (`chipPriceWei × rewardInventoryBps ÷ payoutLiquidityBps` per
chip) the break-even is `chipUsdValue ÷ (chipPriceWei × (1 + 2000/7000))` = $2,592.59. Every run logs `peg` and

    coverage = (vault inventory value + claimable ETH value + rewardInventory ETH value) ÷ totalWinBalance

and a `coverage.WARNING` line below 100%. Below that, the gap has to come from future deposits' reward share or from
the treasurer; the command does not hide it and never buys with ETH it did not draw.

`bun run convert:dry` (default) prints the plan with live quotes and sends nothing; `bun run convert` executes.
Every step is simulated first; the pool quote must be within `MAX_DEVIATION_BPS` of the oracle-implied amount
(CoinGecko ETH/USD × posted asset price) or the run aborts. Each draw is written to `state/conversions.json` before it
is sent, with the planned ETH per asset; after a crash `bun run convert:resume` finishes the swaps from the recorded
remaining ETH and never draws a bucket twice (a draw recorded without a receipt is not re-sent: check the treasurer
wallet if the ETH is missing).

`--loop` (`bun run convert:loop`, or `PROCESS=rewards` in `start.sh`) repeats the run every `INTERVAL_SEC` (300). A
"nothing to do" result or a failed run is just the next tick; an unfinished conversion is resumed automatically; a
wrong chain or a key without `TREASURER_ROLE` still exits. It can run as a hosted service with `STATE_DIR` on a
volume, but that puts a treasurer key on the host: until that is decided it stays a local command.

| Variable | Default | Meaning |
|---|---|---|
| `TREASURY_ADDRESS`, `VAULT_ADDRESS` | — | CasinoTreasury / RewardVault |
| `OPERATOR_PRIVATE_KEY` | — | a key that holds TREASURER_ROLE (optional for a dry run) |
| `SOURCE` | `both` | `claimable`, `inventory` or `both` |
| `WEIGHTS` | equal | split of the budget left after shortfalls, e.g. `CASHCAT=50,PONS=25,AI=25` |
| `AMOUNT_WEI` | everything drawable | convert at most this much in total (claimable first) |
| `MIN_CLAIMABLE_WEI` | `0.0005 ETH` | do not draw `claimable` below this |
| `MIN_INVENTORY_WEI` | `0.004 ETH` | do not draw the whole `rewardInventory` bucket below this (shortfall top-ups excepted) |
| `MIN_SWAP_WEI` | `0.00005 ETH` | smaller slices are folded into the largest one |
| `SLIPPAGE_BPS` | `100` | minimum-out tolerance |
| `MAX_DEVIATION_BPS` | `500` | abort if the pool quote is more than this below the oracle-implied amount |
| `INTERVAL_SEC` | `300` | pause between runs with `--loop` (minimum 30) |
| `ROUTER_ADDRESS`, `QUOTER_ADDRESS`, `FACTORY_ADDRESS` | official Uniswap v3 on 4663 | override off mainnet |

Uniswap v3 on Robinhood Chain (chain 4663, from the official deployments list, verified by bytecode):
SwapRouter02 `0xcaf681a66d020601342297493863e78c959e5cb2`, QuoterV2 `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7`,
UniswapV3Factory `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`, WETH9 `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.

## Running on Railway (always-on)

One image (`Dockerfile`), two services from this repo with **Root Directory `agent/operator`**:

| Service | `PROCESS` | Volume | Notes |
|---|---|---|---|
| `rounds` | `rounds` | mount at `/data` (required: server seeds live in `STATE_DIR=/data`) | set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=120` so a redeploy lets the in-flight round finish |
| `prices` | `prices` | none | posts every `INTERVAL_SEC` (300) |

Shared variables: `OPERATOR_PRIVATE_KEY` (a **hot key that holds only OPERATOR_ROLE**, never the admin/treasurer key),
`RPC_URL`, `CHAIN_ID=4663`. `rounds` also needs `GAME_ADDRESS`, `RANDOMNESS_ADDRESS`, `TABLE_IDS=1`,
`SCAN_FROM_BLOCK=78563886` and, on a fresh volume, `NEXT_ROUND_ID` (the next unused round id). `prices` needs
`ORACLE_ADDRESS`. Railway no longer lets new services opt in to config-as-code, so `railway.json` is informational:
Root Directory, variables and the volume are set in the dashboard (the Dockerfile in the root directory is picked up
automatically). Railway's GitHub App is installed for `rouletterbh/roulette` only; both services auto-deploy from `main`
with Watch Paths `agent/operator/**`, so pushes that touch only the website or docs do not restart them. Run exactly ONE round operator at a time: stop the local
one before the hosted one starts. `bun run convert` stays a local, manual command with the treasurer key (`PROCESS=rewards` exists for a hosted fulfilment loop, but it needs a TREASURER_ROLE key on the host and is not deployed).
