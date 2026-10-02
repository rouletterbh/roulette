# Brand assets (official files only)

Drop OFFICIAL assets here. Nothing in this folder is generated or redrawn.

- `robinhood-chain.svg` — official Robinhood Chain logo (light backgrounds)
- `robinhood-chain-dark.svg` — official Robinhood Chain logo (dark backgrounds); falls back to the light file
- `tokens/<SYMBOL>.svg` — official token/issuer logos, e.g. `tokens/CASHCAT.svg`, `tokens/NVDA.svg`

Slots render a text/monogram fallback until the file exists. Also set `logoURI` in `src/config/tokens.ts` to `/brand/tokens/<SYMBOL>.svg` to enable a token logo.
