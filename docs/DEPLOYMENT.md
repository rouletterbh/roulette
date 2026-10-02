# Deployment

## Robinhood Chain configuration

| | Mainnet | Testnet |
|---|---|---|
| Chain id | 4663 | 46630 |
| RPC | https://rpc.mainnet.chain.robinhood.com | `NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC` (set from official docs; never guess) |
| Explorer | https://robinhoodchain.blockscout.com | `NEXT_PUBLIC_ROBINHOOD_TESTNET_EXPLORER` |
| Gas asset | ETH | ETH |

Defined in `src/config/chains.ts` (viem `defineChain`) and used by wagmi (`src/lib/web3/wagmi.ts`).

## Frontend

1. `bun install && bun run build` (Next.js 16). Deploy to any Node host (Vercel works out of the box).
2. Set env from `.env.example`. Keep `NEXT_PUBLIC_DEMO_MODE=true` until contracts are deployed and addresses are filled in.
3. `OPENAI_API_KEY` is only needed on a developer machine for `bun run assets:generate`. Never set it on the web host.

## Contracts — testnet first

1. Install Foundry (`foundryup`). In `contracts/`: `forge build && forge test`.
2. Export `OPERATOR_PRIVATE_KEY`, `ADMIN_ADDRESS` (multisig), testnet RPC.
3. `forge script script/Deploy.s.sol --rpc-url $TESTNET_RPC --broadcast --verify` (Blockscout verification via `--verifier blockscout --verifier-url <testnet explorer>/api`).
4. Fund the treasury with the initial bankroll (e.g. the equivalent of $100). Check `/treasury` shows the derived limits; confirm a wager above the cap reverts.
5. Run the operator service (commit → open → close → reveal → settle loop) against testnet for at least a week. Verify every round on `/fairness`.
6. Flip `NEXT_PUBLIC_DEMO_MODE=false`, fill `NEXT_PUBLIC_*_ADDRESS`, set `NEXT_PUBLIC_CHAIN_ENV=testnet`.

## Mainnet checklist

- [ ] External audit completed and findings resolved (`/security` currently says NOT YET AUDITED — update only when true)
- [ ] Admin role held by a multisig; operator key in KMS/HSM; two-step admin transfer verified
- [ ] Pause drills: deposits, gameplay, claims, withdrawals each paused and resumed on testnet
- [ ] Economics bps within bounds; safety reserve and exposure cap reviewed against the initial bankroll
- [ ] Reward registry: only assets with verified contract addresses, oracles and `maxStaleness` enabled
- [ ] Jurisdiction config reviewed by counsel; age gate + terms acceptance enforced on real-money routes
- [ ] Legal pages finalized (all `[LEGAL COUNSEL REVIEW REQUIRED]` placeholders replaced)
- [ ] Responsible-play limits enforced server-side, not only in the client
- [ ] Analytics endpoint reviewed for PII (none expected)
- [ ] Incident runbook: who can pause, how players withdraw during a pause

With a $100 bankroll, 15% safety reserve and 25% exposure cap the initial cap per round is $21.25, i.e. a $0.60 maximum straight-up bet and $21 maximum even-money bet. Limits grow with revenue automatically.
