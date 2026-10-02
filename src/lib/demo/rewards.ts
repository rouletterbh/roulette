import { rewardRegistry, type RewardToken, type LiquidityStatus } from "@/config/tokens";

/** DEMO reward-vault inventory. In production this is read from RewardVault + oracles. */
export interface RewardInventory {
  token: RewardToken;
  /** USD-equivalent value of inventory held by the vault. */
  inventoryUsd: number;
  /** Indicative unit price (USD) from the configured oracle, null when no oracle. */
  priceUsd: number | null;
  status: LiquidityStatus;
  statusLabel: string;
}

const demoInventoryUsd: Record<string, number> = {
  "crypto-eth": 41.2,
  "crypto-cashcat": 14.6,
  "crypto-pons": 9.1,
  "crypto-ai": 0,
  "stock-nvda": 0,
  "stock-aapl": 0,
  "stock-tsla": 0,
  "stock-amzn": 0,
  "stock-googl": 0,
  "stock-msft": 0,
};

export function rewardStatus(inventoryUsd: number, token: RewardToken): LiquidityStatus {
  if (!token.contractAddress) return "unverified";
  if (inventoryUsd <= 0) return "unavailable";
  if (inventoryUsd < token.minimumPayout * 10) return "low";
  return "available";
}

export const statusLabel: Record<LiquidityStatus, string> = {
  available: "Available",
  low: "Low inventory",
  unavailable: "Temporarily unavailable",
  unverified: "Not yet listed",
};

export function getRewardInventory(): RewardInventory[] {
  return rewardRegistry.map((token) => {
    const inventoryUsd = demoInventoryUsd[token.id] ?? 0;
    // Demo: ecosystem assets with inventory are shown as available for the claim flow; contract addresses remain unset.
    const status: LiquidityStatus = inventoryUsd > 0 ? (inventoryUsd < token.minimumPayout * 10 ? "low" : "available") : token.category === "stock-token" ? "unverified" : "unavailable";
    return { token, inventoryUsd, priceUsd: null, status, statusLabel: statusLabel[status] };
  });
}

export const totalRewardInventoryUsd = () => getRewardInventory().reduce((s, r) => s + r.inventoryUsd, 0);
