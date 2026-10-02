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

export const rewardRegistry: RewardToken[] = z.array(RewardTokenSchema).parse([
  stock("NVDA", "NVIDIA"),
  stock("AAPL", "Apple"),
  stock("TSLA", "Tesla"),
  stock("AMZN", "Amazon"),
  stock("GOOGL", "Alphabet"),
  stock("MSFT", "Microsoft"),
  crypto("ETH", "Ether"),
  crypto("CASHCAT", "CASHCAT"),
  crypto("PONS", "PONS"),
  crypto("AI", "AI"),
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
