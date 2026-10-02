# Deployments

## Robinhood Chain mainnet (chain id 4663) — 2026-10-03

Deployer / ADMIN / OPERATOR / PAUSER / TREASURER: `0xC80D34d68bAB225890958Cd3326d89030713689c` (single key at launch; rotate later).

| Contract | Address |
|---|---|
| AccessController | `0x42C6B7cd66Ad226CDd89cde0eC0D025DA9702911` |
| Chip1155 | `0xE68741905bDb68D67264409857a9C985Eaa0e2b2` |
| CasinoTreasury | `0xD376887C8103a8697A0009b6bb13e061C0b7e535` |
| RiskEngine | `0xfc9cC755cA4Dd7Bc2BBE31483aCbA65ffeA55086` |
| RandomnessManager | `0xd57Fa0Bb23E43C1Ad872e82BB8D5c5D1A03C3e76` |
| RouletteGame | `0x4d02F58D9e3e0CccaD49dB18ed0609661d61B94A` |
| RewardVault | `0x83Ea24a4276fe47967F375bc8ca10F870c070A5B` |
| PlayerRegistry | `0x38466a02990E992560a25fD90deD271288818D5C` |
| PostedPriceOracle | `0x284C9eCF075D0fD48Fa83C7B8816644392a54E68` |

Config at deploy: chip price 0.00003 ETH, chip USD value $0.10, initial bankroll 0.03 ETH, table 1 limits 1–500 units, split 70/20/8/2 bps, safety reserve 15%, exposure cap 25%, reveal delay 2 blocks. Reward assets registered: CASHCAT, PONS, AI (15 min staleness, $0.50 minimum claim), seed prices posted.

Explorer: https://robinhoodchain.blockscout.com/address/<address>. Broadcast logs: `broadcast/*/4663/run-latest.json`. Contracts are NOT YET AUDITED.
