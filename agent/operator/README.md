# Operator services

## Price relay (`post-prices.ts`)
Keeps `PostedPriceOracle` fresh for CASHCAT, PONS and AI from CoinGecko (platform `robinhood`).

```bash
cd agent/operator && bun install
bun run prices:dry                       # fetch and print, no chain writes
ORACLE_ADDRESS=0x… OPERATOR_PRIVATE_KEY=0x… RPC_URL=https://rpc.mainnet.chain.robinhood.com bun run prices
```

Posts every `INTERVAL_SEC` (default 300s; the vault's staleness window is 900s, so two misses are tolerated). Moves above `MAX_DEVIATION_BPS` (default 20%) are skipped and logged; an ADMIN acknowledges with `forcePrice`. Run it under a supervisor (systemd, Railway, Fly) with the key in a secret store.

The round operator (commit → open → close → reveal → settle) is the next service to add here.
