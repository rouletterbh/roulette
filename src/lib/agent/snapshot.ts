import { demoTables, demoTreasury, type DemoTable } from "@/lib/demo/data";
import { availableBankroll, getMaximumSafeBet } from "@/lib/risk/engine";
import { getRewardInventory, totalRewardInventoryUsd } from "@/lib/demo/rewards";
import { economicsDefaults } from "@/config/economics";
import { activeChain } from "@/config/chains";
import { siteConfig } from "@/config/site";

/** Read-model builders shared by the REST routes (same math as the Treasury page). */

const round2 = (n: number) => Math.round(n * 100) / 100;

export function chainInfo() {
  return {
    id: activeChain.id,
    name: activeChain.name,
    env: siteConfig.chainEnv,
    explorer: activeChain.blockExplorers.default.url,
    nativeCurrency: activeChain.nativeCurrency.symbol,
  };
}

export function treasurySnapshot(t = demoTreasury) {
  const { available, safety } = availableBankroll(t);
  const safeStraight = getMaximumSafeBet(t, 35);
  const safeOutside = getMaximumSafeBet(t, 1);
  const inventory = totalRewardInventoryUsd();
  const totalAssets = t.bankroll + t.protocolReserve + inventory;
  const liabilities = t.reservedLiability + t.claimableRewards;
  const collateralizationPct = liabilities > 0 ? Math.min((totalAssets / liabilities) * 100, 999) : 999;
  return {
    unit: "USD-equivalent",
    snapshot: {
      bankroll: t.bankroll,
      reservedLiability: t.reservedLiability,
      claimableRewards: t.claimableRewards,
      protocolReserve: t.protocolReserve,
      rewardInventoryUsd: round2(inventory),
      unsettledRounds: t.unsettledRounds,
    },
    derived: {
      safetyReserve: round2(safety),
      availableBankroll: round2(available),
      maxRoundExposure: round2(safeStraight.maxRoundExposure),
      totalAssets: round2(totalAssets),
      liabilities: round2(liabilities),
      collateralizationPct: round2(collateralizationPct),
      maxStraightStake: safeStraight.maxStake,
      maxOutsideStake: safeOutside.maxStake,
      tableOpen: safeStraight.tableOpen,
      reason: safeStraight.reason ?? null,
    },
    config: {
      safetyReserveBps: t.safetyReserveBps ?? economicsDefaults.safetyReserveBps,
      maxRoundExposureBps: t.maxRoundExposureBps ?? economicsDefaults.maxRoundExposureBps,
      minBankrollToOpen: economicsDefaults.minBankrollToOpen,
      depositSplitBps: {
        payoutLiquidity: economicsDefaults.payoutLiquidityBps,
        rewardInventory: economicsDefaults.rewardInventoryBps,
        protocolReserve: economicsDefaults.protocolReserveBps,
        platformFee: economicsDefaults.platformFeeBps,
      },
    },
    formula: {
      availableBankroll: "bankroll - reservedLiability - claimableRewards - protocolReserve - safetyReserve",
      maxRoundExposure: "availableBankroll * maxRoundExposureBps / 10000",
      maxStake: "maxRoundExposure / payoutMultiplier",
      accept: "maximumLiabilityAfterBet <= maxRoundExposure",
    },
  };
}

export function serializeTable(t: DemoTable, treasury = demoTreasury) {
  const safeStraight = getMaximumSafeBet(treasury, 35);
  const safeOutside = getMaximumSafeBet(treasury, 1);
  return {
    id: t.id,
    name: t.name,
    variant: t.variant,
    status: t.status,
    visibility: t.visibility,
    speed: t.speed,
    players: t.players,
    spectators: t.spectators,
    lockedReason: t.lockedReason ?? null,
    limits: {
      minBet: t.minBet,
      maxBet: t.maxBet,
      /** Effective caps = min(table max, treasury-derived max for that multiplier). */
      maxOutside: Math.min(t.maxBet, safeOutside.maxStake),
      maxStraight: Math.min(t.maxBet, safeStraight.maxStake),
      treasuryMaxOutside: safeOutside.maxStake,
      treasuryMaxStraight: safeStraight.maxStake,
    },
    recent: t.recent,
  };
}

export function listTables() {
  return demoTables.map((t) => serializeTable(t));
}

export function getTable(id: string) {
  const t = demoTables.find((x) => x.id === id);
  return t ? serializeTable(t) : null;
}

export function rewardsSnapshot() {
  const inv = getRewardInventory();
  return {
    totalInventoryUsd: round2(inv.reduce((s, r) => s + r.inventoryUsd, 0)),
    assets: inv.map((r) => ({
      id: r.token.id,
      symbol: r.token.symbol,
      name: r.token.name,
      category: r.token.category,
      contractAddress: r.token.contractAddress,
      decimals: r.token.decimals,
      minimumPayoutUsd: r.token.minimumPayout,
      enabled: r.token.enabled,
      inventoryUsd: r.inventoryUsd,
      priceUsd: r.priceUsd,
      status: r.status,
      statusLabel: r.statusLabel,
    })),
    note: "Rewards settle from inventory the vault actually holds. Stock Token settlement is additionally gated by jurisdiction.",
  };
}
