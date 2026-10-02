import { z } from "zod";

/**
 * Reward asset registry. NO fake contract addresses: entries without a
 * verified address stay `contractAddress: null` and render as development
 * placeholders. Symbols here are founder-mentioned candidates, not assumptions.
 */
export const RewardCategory = z.enum(["stock-token", "crypto", "special"]);
export const LiquidityStatus = z.enum(["available", "low", "unavailable", "unverified"]);

export const RewardTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable(),
  decimals: z.number().int().min(0).max(18),
  logoURI: z.string().nullable(),
  priceOracle: z.string().nullable(),
  minimumPayout: z.number().nonnegative(),
  enabled: z.boolean(),
  category: RewardCategory,
  liquidityStatus: LiquidityStatus,
  issuerDocsUrl: z.string().url().nullable().optional(),
  /** Explorer-sourced canonical contract (highest holder count, listed on CoinGecko). Not used for settlement until the owner confirms and sets `contractAddress`. */
  candidateAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
  /** Last reference price snapshot (USD) used when the live feed is unavailable; dated in `referencePriceAt`. */
  referencePriceUsd: z.number().positive().nullable().optional(),
  referencePriceAt: z.string().nullable().optional(),
  /** Vault inventory in whole tokens (demo until the vault is funded onchain). */
  inventoryUnits: z.number().nonnegative().optional(),
});
export type RewardToken = z.infer<typeof RewardTokenSchema>;
export type RewardCategory = z.infer<typeof RewardCategory>;
export type LiquidityStatus = z.infer<typeof LiquidityStatus>;

const stock = (symbol: string, name: string): RewardToken => ({
  id: `stock-${symbol.toLowerCase()}`,
  name: `${name} Stock Token`,
  symbol,
  contractAddress: null,
  decimals: 18,
  logoURI: null,
  priceOracle: null,
  minimumPayout: 1,
  enabled: false,
  category: "stock-token",
  liquidityStatus: "unverified",
  issuerDocsUrl: null,
});

const crypto = (symbol: string, name: string): RewardToken => ({
  id: `crypto-${symbol.toLowerCase()}`,
  name,
  symbol,
  contractAddress: null,
  decimals: 18,
  logoURI: null,
  priceOracle: null,
  minimumPayout: 0.5,
  enabled: false,
  category: "crypto",
  liquidityStatus: "unverified",
});

// Contract addresses for CASHCAT / PONS / AI confirmed by the owner on 2026-10-03
// (canonical contracts on the Robinhood Chain explorer). Claims remain disabled
// until an oracle and vault inventory exist for each asset (`enabled`, `priceOracle`).
// Logos: ETH from ethereum.org brand assets; CASHCAT / PONS / AI from the artwork
// each token lists on the Robinhood Chain explorer (CoinGecko), fetched 2026-10-03.
// Stock Tokens carry no logo: company marks are third-party trademarks and the
// explorer lists no Robinhood-issued Stock Token contracts under these symbols yet.
export const rewardRegistry: RewardToken[] = z.array(RewardTokenSchema).parse([
  stock("NVDA", "NVIDIA"),
  stock("AAPL", "Apple"),
  stock("TSLA", "Tesla"),
  stock("AMZN", "Amazon"),
  stock("GOOGL", "Alphabet"),
  stock("MSFT", "Microsoft"),
  { ...crypto("ETH", "Ether"), logoURI: "/brand/tokens/ETH.svg" },
  // Oracle: PostedPriceOracle (contracts/src/PostedPriceOracle.sol) fed by agent/operator/post-prices.ts
  // from CoinGecko (platform "robinhood"). `priceOracle` holds the feed descriptor until the oracle
  // contract is deployed, then its address. Reference snapshots taken 2026-10-03.
  { ...crypto("CASHCAT", "Cash Cat"), logoURI: "/brand/tokens/CASHCAT.png", contractAddress: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", candidateAddress: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", priceOracle: "0x284C9eCF075D0fD48Fa83C7B8816644392a54E68", referencePriceUsd: 0.160111, referencePriceAt: "2026-10-03", enabled: true, liquidityStatus: "available", inventoryUnits: 250 },
  { ...crypto("PONS", "Pons"), logoURI: "/brand/tokens/PONS.png", contractAddress: "0x39dBED3a2bd333467115dE45665cC57F813C4571", candidateAddress: "0x39dBED3a2bd333467115dE45665cC57F813C4571", priceOracle: "0x284C9eCF075D0fD48Fa83C7B8816644392a54E68", referencePriceUsd: 0.45741, referencePriceAt: "2026-10-03", enabled: true, liquidityStatus: "available", inventoryUnits: 60 },
  { ...crypto("AI", "Artificial Inu"), logoURI: "/brand/tokens/AI.png", contractAddress: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18", candidateAddress: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18", priceOracle: "0x284C9eCF075D0fD48Fa83C7B8816644392a54E68", referencePriceUsd: 0.144829, referencePriceAt: "2026-10-03", enabled: true, liquidityStatus: "available", inventoryUnits: 150 },
]);

export const chipTokenIds = {
  1: 1001n,
  5: 1005n,
  10: 1010n,
  25: 1025n,
  50: 1050n,
  100: 1100n,
} as const;
export type ChipDenomination = keyof typeof chipTokenIds;
export const chipDenominations = [1, 5, 10, 25, 50, 100] as const satisfies readonly ChipDenomination[];
