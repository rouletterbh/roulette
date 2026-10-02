# Brand assets (official files only)

Drop OFFICIAL assets here. Nothing in this folder is generated or redrawn.

- `robinhood-chain.svg` — official Robinhood Chain logo (light backgrounds)
- `robinhood-chain-dark.svg` — official Robinhood Chain logo (dark backgrounds); falls back to the light file
- `tokens/<SYMBOL>.svg` — official token/issuer logos, e.g. `tokens/CASHCAT.svg`, `tokens/NVDA.svg`

Slots render a text/monogram fallback until the file exists. Also set `logoURI` in `src/config/tokens.ts` to `/brand/tokens/<SYMBOL>.svg` to enable a token logo.

## Provenance
- `robinhood-chain.svg` / `robinhood-chain-dark.svg`: the official Robinhood feather mark as served by Robinhood's CDN for the Robinhood Chain documentation site (`cdn.robinhood.com/assets/generated_assets/hoodchain_docsite/feather-{dark,light}.svg`), fetched 2026-10-03 with the owner's stated permission from Robinhood Chain. The mark is used only beside the words "Robinhood Chain" to identify the network; never stylized or recolored.
- `tokens/ETH.svg`: ethereum.org brand asset (eth-diamond-purple, works on light and dark). `tokens/CASHCAT.png`, `tokens/PONS.png`, `tokens/AI.png`: the artwork each token lists on the Robinhood Chain Blockscout explorer (served via CoinGecko), fetched 2026-10-03 at the owner's request. Stock Token symbols have no logo on purpose (third-party trademarks; no Robinhood-issued contracts listed under those symbols on the explorer yet).
