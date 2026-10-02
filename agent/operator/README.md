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
| `BETTING_SECONDS` | `20` | betting window per round |
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
