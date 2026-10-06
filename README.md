# Roblette — social onchain roulette on Robinhood Chain

A social roulette club where chips live onchain as ERC-1155 assets and wins can settle in crypto or supported Stock Tokens. Built as an independent product on **Robinhood Chain** (mainnet chain id 4663, testnet 46630). Not operated, endorsed or owned by Robinhood.

> Play the table, not the interface.

## What's here

| Area | Status |
|---|---|
| Design system (light-first, luxurious dark), editorial serif + UI sans, tokens | ✅ `src/app/globals.css`, `docs/DESIGN-SYSTEM.md` |
| Homepage with original OpenAI-generated artwork | ✅ `/` |
| Practice roulette (free, no value) with deterministic wheel + commit–reveal proofs | ✅ `/play/practice` |
| Quick play, live tables with simulated seat-mates, private tables, create wizard, explore | ✅ `/play/quick`, `/tables`, `/table/[id]`, `/create`, `/explore` |
| Solvency / risk engine (max safe bet, per-round exposure cap, deposit split) | ✅ `src/lib/risk/engine.ts` + tests |
| Rewards, treasury dashboard, provably-fair verifier, cashier with tx state machine | ✅ `/rewards`, `/treasury`, `/fairness`, `/cashier` |
| Profiles, leaderboard, account, referrals, hidden admin | ✅ `/player/[wallet]`, `/leaderboard`, `/me`, `/referrals`, `/admin` |
| Legal, disclosure, responsible-play tools, FAQ, about/technology/security | ✅ see sitemap |
| Solidity contracts (Foundry layout) + tests + deploy script | ✅ `contracts/` (NOT YET AUDITED, not deployed) |
| Wallet (wagmi/viem) with Robinhood Chain config | ✅ behind `NEXT_PUBLIC_DEMO_MODE=false` |
| Postgres schema for offchain indexing | ✅ `prisma/schema.prisma` |

**Demo mode** (`NEXT_PUBLIC_DEMO_MODE=true`, default) simulates wallet, balances, tables, rounds, leaderboards and reward inventory. Everything simulated is labeled **DEMO**. Nothing in demo mode is live blockchain state.

## Quick start

```bash
bun install
cp .env.example .env.local   # fill OPENAI_API_KEY only if you want to regenerate artwork
bun run dev                  # http://localhost:3000
bun run test                 # vitest: payout math, risk engine, commit–reveal
bun run typecheck && bun run lint
```

Node 20+ / Bun 1.4+. The project name is configurable via `NEXT_PUBLIC_PROJECT_NAME`.

## The one rule that matters: solvency

The founders fund ~$100 and do not top up. So **every wager is limited by available collateral before it is accepted**:

```
availableBankroll = bankroll − reservedLiability − claimableRewards − protocolReserve − safetyReserve
maxRoundExposure  = availableBankroll × maxRoundExposureBps / 10 000
accept(bets)  ⇔   maximumLiability(bets) ≤ maxRoundExposure        // worst case over all 37 outcomes
maxStake(m)   =   maxRoundExposure / m                               // m = payout multiplier (35 for straight)
```

Implemented in `src/lib/risk/engine.ts` (UI + tests) and mirrored in `contracts/src/RiskEngine.sol`. Limits expand automatically as the treasury grows; locked tables ("HIGH ROLLER") open themselves when liquidity supports them. We never fake liquidity.

Deposits are split by configurable, bounded bps (`src/config/economics.ts`): payout liquidity / reward inventory / protocol reserve / platform fee.

## Fairness

`result = keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ roundId) mod 37`. The commitment `keccak256(serverSeed)` is published before bets open; the seed is revealed after. The wheel animation only replays the committed result. `Math.random()` is never used for outcomes (demo ambience uses a seeded PRNG for simulated seat-mates only). See `/fairness` and `src/lib/fairness/commit-reveal.ts`.

## Architecture

```
src/
  app/            routes (App Router) — see sitemap below
  components/     ui/ layout/ home/ roulette/ table/ rewards/ treasury/ cashier/ fairness/ player/ account/ …
  store/          zustand slices: wallet, chips, game (round lifecycle), live-table, preferences, created-tables, responsible, admin
  lib/            roulette (wheel/bets/settle), risk (solvency), fairness (commit–reveal), demo (simulated data), sound, analytics, web3
  config/         site, chains (Robinhood Chain), tokens (reward registry + chip ids), economics, jurisdictions, achievements
contracts/        Foundry project (see contracts/README.md)
prisma/           offchain index schema
scripts/          OpenAI asset generation + optimization
docs/             design system, deployment, database, assets
```

State is split per domain (wallet, chips, game round, table, treasury, preferences). There is no global god-object.

## Sitemap

`/` `/play` `/play/practice` `/play/quick` `/tables` `/table/[id]` `/create` `/explore` `/rewards` `/leaderboard` `/treasury` `/fairness` `/player/[wallet]` `/me` `/me/history` `/me/rewards` `/me/chips` `/cashier` `/referrals` `/tournaments` `/about` `/how-it-works` `/technology` `/security` `/faq` `/responsible-play` `/legal` `/terms` `/privacy` `/cookies` `/risk-disclosure` `/stock-token-disclosure` `/restricted-jurisdictions` `/aml` — plus unlisted `/admin`.

## Links

- Site: https://www.roblette.fun
- X: https://x.com/robletterbh
- Roblette token (RBL) on Robinhood Chain: `0x041f48E1C2855be1287B94363f4f3D8585ceCCdc` (not required to play; a reward asset once registered on the vault, claimable at the oracle price from vault inventory bought on its launch curve; the only official contract)

## Docs

- `docs/DESIGN-SYSTEM.md` — tokens, components, conventions
- `docs/DEPLOYMENT.md` — Robinhood Chain config, testnet-first process, mainnet checklist
- `docs/DATABASE.md` — Postgres/Prisma setup
- `docs/ASSETS.md` — OpenAI artwork generation (server-side key only)
- `contracts/README.md` — contract architecture, roles, invariants

## Brand & legal guardrails

Always "Robinhood Chain" and "Stock Tokens". No implied partnership or endorsement. No invented licenses, audits (`NOT YET AUDITED`) or jurisdictions; real-money play stays disabled in every jurisdiction until counsel enables it (`src/config/jurisdictions.ts`). Placeholders are marked `[LEGAL COUNSEL REVIEW REQUIRED]`.
