# Roulette contracts — Robinhood Chain

Smart-contract layer for the onchain social roulette platform. Foundry project, Solidity `^0.8.26`,
OpenZeppelin v5, EVM target `cancun`.

> **NOT YET AUDITED.** This code has not been reviewed by a third-party auditor. Do not deploy to
> mainnet with real funds before an audit and the checklist at the bottom of this document.

The Solidity mirrors the semantics of the web app's engine exactly:

| TypeScript source                      | Solidity                                              |
| -------------------------------------- | ----------------------------------------------------- |
| `src/lib/roulette/bets.ts`             | `RiskEngine.isValidBet`, multiplier table             |
| `src/lib/roulette/settle.ts`           | `RiskEngine.payout`, `RiskEngine.maximumLiability`    |
| `src/lib/risk/engine.ts`               | `CasinoTreasury.availableBankroll`, `RiskEngine.maxSafeStake`, `RiskEngine.checkWager` |
| `src/lib/fairness/commit-reveal.ts`    | `RandomnessManager.deriveResult`                      |
| `src/config/economics.ts`              | `CasinoTreasury` split/risk config and bounds         |
| `src/config/tokens.ts`                 | `Chip1155` ids, `RewardVault` asset registry/status   |

## Layout

```
contracts/
├── foundry.toml            # Foundry profile (cancun, optimizer 200 runs)
├── remappings.txt          # @openzeppelin/contracts/ -> node_modules
├── compile-check.mjs       # solc-js compile of src/ test/ script/ (no forge needed)
├── src/
│   ├── Roles.sol               role ids
│   ├── RoleGated.sol           mixin: onlyRole against the shared AccessController
│   ├── EmergencyPause.sol      mixin: granular pause flags
│   ├── AccessController.sol    AccessControlDefaultAdminRules (two-step admin)
│   ├── Chip1155.sol            ERC-1155 chips (ids 1001/1005/1010/1025/1050/1100)
│   ├── CasinoTreasury.sol      ETH custody, deposit split, chip mint/redeem, solvency ledger
│   ├── RiskEngine.sol          pure payout / liability / exposure math + bet validation
│   ├── RandomnessManager.sol   commit-reveal + future blockhash (IRandomnessSource)
│   ├── RouletteGame.sol        tables, rounds, bets, settlement, internal escrow
│   ├── RewardVault.sol         reward inventory + USD winBalance + claims (ClaimManager merged)
│   ├── PlayerRegistry.sol      display-name hash + referral codes
│   └── interfaces/             IAccessController, IChip1155, ICasinoTreasury, IRiskEngine,
│                               IRandomnessSource, IRewardVault, IPriceOracle
├── test/
│   ├── utils/BaseTest.sol      minimal Vm cheatcode interface + assertions (forge-std shim)
│   ├── utils/Mocks.sol         MockERC20, MockOracle, MaliciousReceiver
│   ├── utils/Fixture.sol       full-stack deployment + helpers
│   ├── *.t.sol                 unit tests per contract
│   └── invariants/TreasuryInvariants.t.sol
└── script/
    ├── utils/ScriptBase.sol    minimal script cheatcode interface
    └── Deploy.s.sol            ordered deployment + role wiring
```

## Architecture

```
                         ┌──────────────────────┐
                         │   AccessController   │  roles: ADMIN (2-step), OPERATOR, PAUSER,
                         │ (DefaultAdminRules)  │  TREASURER, GAME, MINTER, REWARD_CREDITOR
                         └──────────┬───────────┘
                hasRole() ──────────┼─────────────────────────────────┐
          ┌─────────────────────────┼───────────────────┐             │
          ▼                         ▼                   ▼             ▼
┌──────────────────┐      ┌──────────────────┐   ┌──────────────┐  ┌──────────────┐
│   RouletteGame   │─────▶│  CasinoTreasury  │──▶│   Chip1155   │  │ RewardVault  │
│  tables, rounds, │GAME  │  ETH custody     │MINT│ ERC-1155     │  │ inventory +  │
│  bets, escrow,   │      │  deposit split   │BURN│ supply-      │  │ winBalance + │
│  settlement      │      │  solvency ledger │   │ tracked      │  │ claims       │
└───┬──────────┬───┘      └────────┬─────────┘   └──────────────┘  └──────▲───────┘
    │          │                   │ credit(player, usd)  REWARD_CREDITOR   │
    │          │                   └──────────────────────────────────────┘
    │          │ pure calls                                  ▲ getPrice()
    │          ▼                                             │
    │   ┌──────────────┐                              ┌──────┴───────┐
    │   │  RiskEngine  │  payout, maximumLiability,   │ IPriceOracle │ (adapter per asset)
    │   │  (immutable) │  maxSafeStake, checkWager    └──────────────┘
    │   └──────────────┘
    │ lock()/status()/result()
    ▼
┌────────────────────┐
│ RandomnessManager  │  IRandomnessSource: commit → lock → reveal | void
│ (VRF-swappable)    │
└────────────────────┘

PlayerRegistry stands alone (no roles, no funds).
```

**Separation of concerns.** Custody (`CasinoTreasury`) never contains game logic; the game never
holds ETH or chips; randomness never knows about money; rewards never know about rounds. Each
boundary is a role held by exactly one contract (`GAME`, `MINTER`, `REWARD_CREDITOR`).

## Role model

| Role                   | Holder                      | Can                                                                                  |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `ADMIN` (DEFAULT_ADMIN)| multisig (two-step transfer)| grant/revoke roles, lower pause flags, bounded config setters, register reward assets |
| `OPERATOR`             | server key                  | commit/reveal seeds, create/update tables, open/close rounds, cancel an *open* round  |
| `PAUSER`               | low-trust hot key           | **raise** pause flags only                                                           |
| `TREASURER`            | multisig / ops key          | move earmarked buckets (revenue, reserve, inventory, claimable, surplus), fund/withdraw reward inventory |
| `GAME`                 | `RouletteGame` contract     | `reserve`, `release`, `escrowIn`, `escrowOut`, `settle` on the treasury; `lock` on randomness |
| `MINTER`               | `CasinoTreasury` contract   | mint/burn chips                                                                      |
| `REWARD_CREDITOR`      | `CasinoTreasury` contract   | credit `winBalance` in the vault                                                     |

Pause flags per contract: `DEPOSITS (1)`, `GAMEPLAY (2)`, `CLAIMS (4)`, `WITHDRAWALS (8)`.
Treasury uses DEPOSITS / WITHDRAWALS / CLAIMS (convert-to-rewards); Game uses GAMEPLAY;
Vault uses CLAIMS. `leaveTable` is deliberately not pausable (escrow can never be trapped).

## Solvency model

All accounting lives in `CasinoTreasury` (wei). Chips are game credits backed 1:1 by ETH.

```
chipLiabilityUnits = Chip1155.totalUnits() + escrowUnits          (chips in wallets + chips in play)
chipLiability      = chipLiabilityUnits * chipPriceWei
bankroll           = payoutPool - chipLiability                     <- "bankroll" in engine.ts (house equity)
reservedLiability  = reservedUnits * chipPriceWei                   <- worst-case net payout of open rounds
safetyReserve      = bankroll * safetyReserveBps / 10_000
availableBankroll  = bankroll - reservedLiability - claimable - protocolReserve - safetyReserve   (floored at 0)
maxRoundExposure   = availableBankroll * maxRoundExposureBps / 10_000
```

**Before EVERY wager** (`RouletteGame.placeBets`) the full bet set of the round is re-evaluated:

```
maximumLiability(allBetsInRound) = max over the 37 pockets of Σ stake*(multiplier+1), minus Σ stakes
require  maximumLiability(allBetsInRound) <= (availableBankroll + thisRoundsCurrentReservation) * maxRoundExposureBps / 10_000
```

otherwise the transaction reverts with `ExposureCapExceeded(maxNetPayout, maxRoundExposure)`. The
round's reservation is then re-synced via `CasinoTreasury.reserve/release`, and `reserve()` performs
its own independent check against `availableBankroll()` (`InsufficientBankroll`). A wager therefore
can never be accepted undercollateralised, even if the game contract had a bug.

Invariants (asserted after every accounting path and fuzzed in `test/invariants`):

```
I1  address(treasury).balance >= payoutPool + rewardInventory + revenue + totalWithdrawable   (assets >= liabilities)
I2  payoutPool >= chipLiability + reservedLiability + claimable + protocolReserve
I3  reservedLiability >= maximum outstanding net payout of every open round
I4  withdrawable surplus <= bankroll - liabilities          (CasinoTreasury.surplus())
    a settled round can never settle twice                 (RouletteGame status machine)
    a claim can never execute twice                        (RewardVault decrements before transfer)
    totalClaimed(asset) <= totalFunded(asset)
```

### Why chips are minted only for the payout-liquidity share

`deposit()` splits the incoming ETH per `splitConfig` **and mints chips for the liquidity share only**
(`units = value * payoutLiquidityBps / 10_000 / chipPriceWei`). Minting chips for the full deposit
while routing 30% to inventory/reserve/fee would reduce house equity by 30% of *every* deposit, and
the founders will not top up. With this model:

* a deposit is solvency-neutral (chip liability and `payoutPool` grow by the same amount),
* only founder capital plus realised house edge is ever at risk,
* limits grow automatically as the bankroll grows (`availableBankroll` is live).

Founder capital enters via `fundBankroll()` (or a plain ETH transfer): no chips are minted.
House wins stay in `payoutPool` as equity; the treasurer takes profit via `withdrawSurplus`, bounded
by I4. If the product decision is "1 unit of chips per unit of ETH deposited", set
`payoutLiquidityBps` as high as the bound allows (9000) and treat the remainder as the explicit
platform take.

### What $100 of initial bankroll yields

With `safetyReserveBps = 1500`, `maxRoundExposureBps = 2500`, no open rounds, no claimable:

```
availableBankroll = 100 * (1 - 0.15) = $85       maxRoundExposure = 85 * 0.25 = $21.25
max stake per bet kind = floor(maxRoundExposure / multiplier)
```

| chip unit = | straight (35) | split (17) | street (11) | corner (8) | sixline (5) | dozen/column (2) | even money (1) |
| ----------- | ------------- | ---------- | ----------- | ---------- | ----------- | ---------------- | -------------- |
| $1.00       | 0 (blocked)   | 1          | 1           | 2          | 4           | 10               | 21             |
| $0.10       | 6 ($0.60)     | 12         | 19          | 26         | 42          | 106 ($10.60)     | 212 ($21.20)   |
| $0.01       | 60 ($0.60)    | 125        | 193         | 265        | 425         | 1 062            | 2 125          |

Set `chipPriceWei` so that a unit is small enough for straight-up bets to be placeable at launch
(e.g. `chipPriceWei = 0.10 USD worth of ETH`). The exposure cap is per *round across all players*,
so the table effectively offers a $21 book per spin at $100 equity; every $100 of further equity adds
another $21.25 of per-round exposure.

`minBankrollToOpenUnits` (default 25 units, `minBankrollToOpen` in economics.ts) must be met for a
round to open.

## Deposit split configuration

Defaults and safe bounds mirror `src/config/economics.ts`; the setters revert outside them and the
four split values must sum to exactly 10 000.

| Parameter             | Default | Bound        | Goes to                                  |
| --------------------- | ------- | ------------ | ---------------------------------------- |
| `payoutLiquidityBps`  | 7000    | [5000, 9000] | `payoutPool` (chips minted for this)     |
| `rewardInventoryBps`  | 2000    | [0, 4000]    | `rewardInventory` bucket                 |
| `protocolReserveBps`  | 800     | [0, 2000]    | `payoutPool`, earmarked `protocolReserve`|
| `platformFeeBps`      | 200     | [0, 500]     | `revenue` bucket (remainder, exact sum)  |
| `safetyReserveBps`    | 1500    | [500, 5000]  | never exposed to a round                 |
| `maxRoundExposureBps` | 2500    | [500, 5000]  | per-round liability cap                  |

`chipPriceWei` can be changed by ADMIN only if the treasury stays solvent at the new price
(re-prices every outstanding chip). `chipUsdValue` (USD per unit, 1e18) sets the reward credit a unit
converts to.

## Player flow

1. `Chip1155.setApprovalForAll(treasury, true)` once.
2. `CasinoTreasury.deposit{value}()` → chips minted (greedy denominations).
3. `RouletteGame.enterTable(ids, amounts)` → chips burned into escrow units
   (one burn instead of N ERC-1155 transfers; bets and payouts are then plain integer accounting).
4. `placeBets(roundId, Bet[])` with `Bet{numbersMask (bit i = pocket i), multiplier, stake}`.
5. After `settleRound`, winnings are credited to escrow. `leaveTable(units)` mints chips back.
6. `CasinoTreasury.redeem(ids, amounts)` → ETH credited, `withdraw()` pulls it (single ETH exit,
   pull-payment, `nonReentrant`). Or `convertToRewards(ids, amounts)` → USD `winBalance` in the
   vault → `RewardVault.claimAs(asset, usdAmount, minOut, deadline)`.

## Randomness

```
commit(roundId, keccak256(serverSeed))   OPERATOR, before openRound (openRound reverts otherwise)
lock(roundId, playerSeed)                GAME at closeRound; revealAfterBlock = block.number + revealDelayBlocks
reveal(roundId, serverSeed)              OPERATOR after revealAfterBlock; blockRef = blockhash(revealAfterBlock)
result = uint256(keccak256(abi.encodePacked(serverSeed, playerSeed, blockRef, roundId))) % 37
```

`playerSeed` is folded by the game from every bet (`keccak256(prev, player, mask, multiplier, stake)`).
If the operator does not reveal within 256 blocks of `revealAfterBlock`, anyone can `markVoid` /
`RouletteGame.voidRound`, refunding every stake. An *open* round the operator abandons for longer
than `roundTimeout` (default 1 day) can also be voided by anyone.

Threat model: neither side can choose the result (seed committed before bets, block hash produced
after close, players contribute entropy). The operator *can* refuse to reveal and let a round void
(selective abort, visible onchain as `Voided`). On Robinhood Chain (Arbitrum-style), `blockhash`
is a sequencer-influenced value. Both points are removed by a VRF adapter implementing
`IRandomnessSource`; the game depends only on that interface. Treat a VRF adapter as a mainnet
prerequisite for meaningful stakes.

## Robinhood Chain configuration

| Network | Chain id | RPC                                        | Explorer                                  |
| ------- | -------- | ------------------------------------------ | ----------------------------------------- |
| Mainnet | 4663     | `https://rpc.mainnet.chain.robinhood.com`  | `https://robinhoodchain.blockscout.com`   |
| Testnet | 46630    | `$ROBINHOOD_TESTNET_RPC_URL` (env)         | `$ROBINHOOD_TESTNET_EXPLORER_URL` (env)   |

Gas asset is ETH. The testnet RPC/explorer are read from the environment; this repository does not
hardcode them. EVM target is `cancun` (OpenZeppelin 5.6 uses `mcopy`); confirm the chain's ArbOS
version supports Cancun opcodes before deploying, or pin an older OpenZeppelin and set
`evm_version = "paris"`.

## Build and test

Foundry is not required to type-check the code:

```sh
cd contracts
bun install
bun compile-check.mjs            # compiles src/, test/, script/ with solc-js; exit 1 on errors
```

With Foundry installed:

```sh
forge build
forge test -vvv
forge test --match-path 'test/invariants/*' -vvv
```

Tests use a tiny shim (`test/utils/BaseTest.sol`) that declares the forge cheatcode interface at
the canonical `hevm cheat code` address, so they run unchanged under `forge test`. Switching to
forge-std is a one-line import change (`import {Test as BaseTest} from "forge-std/Test.sol";` after
`forge install foundry-rs/forge-std`); same for `script/utils/ScriptBase.sol`.

Test coverage: payout math; bet validation (bad masks, wrong multipliers); treasury solvency
(undercollateralised wager reverts at both the game and treasury layer); max safe wager; reserved
liability across place/settle/void; deposit split accounting; chip mint/redeem/burn accounting;
claim accounting (double-claim, stale oracle, invalid token, slippage, deadline, inventory);
round lifecycle (commitment required, no bets after close, settle-once, reveal mismatch, expired
window voids and refunds, abandoned-round timeout); access control; pause flags; reentrancy via a
malicious receiver on `withdraw`; and the invariant suite listed above.

## Deployment

### Testnet first (chain id 46630)

```sh
export ROBINHOOD_TESTNET_RPC_URL=...        # from the Robinhood Chain docs, never hardcoded
export ROBINHOOD_TESTNET_EXPLORER_URL=...
export PRIVATE_KEY=0x...                    # deployer
export ADMIN=0x...     OPERATOR=0x...  PAUSER=0x...  TREASURER=0x...
export CHIP_PRICE_WEI=...                   # e.g. ETH value of $0.10
export INITIAL_BANKROLL_WEI=...             # optional founder funding in the same tx

forge script script/Deploy.s.sol:Deploy --rpc-url $ROBINHOOD_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY --broadcast -vvvv
```

Deployment order (see `Deploy.s.sol`): AccessController → Chip1155 → CasinoTreasury → RiskEngine →
RandomnessManager → RouletteGame → RewardVault → PlayerRegistry → role wiring → first table →
optional funding → `beginDefaultAdminTransfer(ADMIN)` when `ADMIN != deployer` (ADMIN must call
`acceptDefaultAdminTransfer()` after `ADMIN_TRANSFER_DELAY`).

Then, on testnet:

1. Register at least one reward asset with a working `IPriceOracle` adapter and fund inventory.
2. Run a full round from the server: `commit` → `openRound` → players bet → `closeRound` → wait
   `revealDelayBlocks` → `reveal` → `settleRound`. Verify `RandomnessManager.verify(roundId)`.
3. Run a void drill: close a round, do not reveal, wait > 256 blocks, `voidRound`, confirm refunds.
4. Pause drill: PAUSER raises every flag on every contract; confirm `leaveTable` still works and
   ADMIN can lower flags.
5. Confirm `CasinoTreasury.isSolvent()` after every step; the indexer should alert if it ever flips.

### Mainnet checklist (chain id 4663)

- [ ] **Audit completed** and findings resolved. The code is NOT YET AUDITED.
- [ ] `ADMIN` and `TREASURER` are multisigs; `ADMIN_TRANSFER_DELAY` ≥ 24h; deployer key retired after
      `acceptDefaultAdminTransfer`.
- [ ] `OPERATOR` is a dedicated server key with no other roles; `PAUSER` is a separate hot key.
- [ ] Randomness: VRF adapter deployed and wired, or explicit acceptance of the commit-reveal /
      blockhash limitations above with low table maxima.
- [ ] Oracle adapters per reward asset reviewed: `maxStaleness`, decimals, `minimumPayoutUsd`,
      `lowWatermark`; `status()` shows `AVAILABLE` for every enabled asset. No hardcoded token addresses.
- [ ] Economics: split and risk config verified against the bounds; `chipPriceWei` chosen so that
      straight-up bets are placeable at the initial bankroll (see the $100 table).
- [ ] Initial bankroll funded through `fundBankroll()` (not `deposit()`), `isSolvent()` true,
      `availableBankrollUnits()` and `maxStakeFor(35)` match expectations.
- [ ] Pause drill and void drill repeated on mainnet with dust amounts before announcing.
- [ ] Contracts verified on `https://robinhoodchain.blockscout.com`.
- [ ] Monitoring: alerts on `SolvencyViolation` (should be impossible), `Voided`, `PauseFlagsUpdated`,
      `BucketWithdrawn`, large `RoundExposureUpdated`.

## Admin boundary

What no role, including ADMIN, can ever do:

* **Alter a completed outcome.** `RandomnessManager` has no result setter; the result is derived
  from committed data and `verify(roundId)` recomputes it. `RouletteGame` stores the result once at
  settlement and has no setter.
* **Rewrite history.** Rounds move `None → Open → Closed → Settled | Voided`; no transition goes
  backwards; `roundId` can never be reused in either contract.
* **Take player escrow.** The only functions that change `escrow[player]` are the player's own
  `enterTable`/`leaveTable`/`placeBets` and settlement/refund. `leaveTable` is not pausable.
  Chips are burned only with the owner's ERC-1155 approval.
* **Change a submitted wager.** Bets are append-only storage; nothing edits a `PlacedBet`.
* **Withdraw beyond the formula.** Treasurer withdrawals are bounded per bucket and by
  `surplus() = bankroll - liabilities`; the ETH backing chips, reservations and reward credits is
  unreachable.
* **Swap the risk engine.** `RISK`, `TREASURY` and `RANDOMNESS` are `immutable` in the game.

What ADMIN *can* do (and should be monitored): raise/lower bounded parameters, pause flows
temporarily, register reward assets and their oracles, re-price chips only while solvent, and
(via OPERATOR) cancel a round *before* close, which refunds everyone in full.

## Design decisions and trade-offs

* **Internal escrow instead of per-bet ERC-1155 transfers** — one burn on entry, one mint on exit;
  bets/payouts are integer accounting. Chip liability is unchanged by escrow (`escrowUnits` is part of
  `chipLiabilityUnits`), so solvency math is identical.
* **`settle` is per round, not per player** — `RouletteGame` credits each winner's escrow and makes a
  single `CasinoTreasury.settle(roundId, staked, returned, released)` call; per-bet detail is emitted
  as `BetSettled` events for indexers.
* **Full-round re-evaluation on every `placeBets`** — `maximumLiability` is O(37 × bets) over an
  in-memory copy of the round (two SLOADs per stored bet). `maxBetsPerRound` (default 256, cap 1000)
  bounds gas. Keeping a per-pocket running total in storage was rejected: up to 18 cold SSTOREs per
  bet costs more than the recompute for typical rounds.
* **Geometry by exact mask equality** — stricter than the TS endpoint checks (e.g. a malformed
  "corner" `{1,3,4,5}` is rejected here). Anything the TS rejects is rejected here.
* **ClaimManager merged into RewardVault** — a claim is one atomic quote/decrement/transfer; a second
  contract would add a trust boundary without reducing risk.
* **No signature-based betting** — `placeBets` is always sent by the player, so there is no nonce or
  deadline replay surface. Private tables are a flag for UI/indexers; invite enforcement is offchain.
* **No ERC-20 deposit asset** — ETH only in this version; adding a whitelisted ERC-20 would require a
  second price axis for chip backing and is left as a follow-up.
* **`RiskEngine` is a contract, not a library** — callable offchain for UI quotes
  (`maxSafeStake`, `maximumLiability`) and referenced immutably by the game.
