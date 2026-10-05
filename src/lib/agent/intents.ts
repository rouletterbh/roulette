import { encodeFunctionData, isAddress, type Hex } from "viem";
import { activeChain } from "@/config/chains";
import { chipTokenIds, type ChipDenomination } from "@/config/tokens";
import { casinoTreasuryAbi, chip1155Abi, rewardVaultAbi, rouletteGameAbi } from "@/lib/web3/abi";
import { contractBetToJson, type ContractBet } from "./encode-bets";

/**
 * Unsigned transaction intents. This module never holds a key and never signs:
 * it returns calldata the agent's own wallet must review and sign, encoded with the
 * deployed contracts' own ABIs.
 */
export type ContractName = "RouletteGame" | "Chip1155" | "CasinoTreasury" | "RewardVault";

const ENV: Record<ContractName, string> = {
  RouletteGame: "NEXT_PUBLIC_ROULETTE_GAME_ADDRESS",
  Chip1155: "NEXT_PUBLIC_CHIP1155_ADDRESS",
  CasinoTreasury: "NEXT_PUBLIC_TREASURY_ADDRESS",
  RewardVault: "NEXT_PUBLIC_REWARD_VAULT_ADDRESS",
};

export function contractAddress(name: ContractName): `0x${string}` | null {
  const v = process.env[ENV[name]];
  return v && isAddress(v) ? (v as `0x${string}`) : null;
}

export function deployedContracts() {
  return Object.fromEntries((Object.keys(ENV) as ContractName[]).map((n) => [n, contractAddress(n)])) as Record<ContractName, `0x${string}` | null>;
}

/* ---------------------------------------------------------------- ABIs */

// The Foundry-exported ABIs of the deployed contracts (src/lib/web3/abi), so calldata is
// encoded against exactly what is on chain. `erc1155ApprovalAbi` is the Chip1155 ABI.
export { rouletteGameAbi, rewardVaultAbi };
export const erc1155ApprovalAbi = chip1155Abi;

export const FUNCTION_SIGNATURES = {
  enterTable: "enterTable(uint256[] ids,uint256[] amounts)",
  leaveTable: "leaveTable(uint256 units)",
  placeBets: "placeBets(uint256 roundId,(uint64 numbersMask,uint16 multiplier,uint128 stake)[] bets)",
  convertToRewards: "convertToRewards(uint256[] ids,uint256[] amounts)",
  claimAs: "claimAs(address asset,uint256 usdAmount,uint256 minOut,uint256 deadline)",
  setApprovalForAll: "setApprovalForAll(address operator,bool approved)",
} as const;

/* ---------------------------------------------------------------- intent shape */

export interface TxIntent {
  /** Target contract, or null when the contract is not deployed (demo preview). */
  to: `0x${string}` | null;
  contract: ContractName;
  chainId: number;
  /** Native value in wei, decimal string. Always "0" for these calls. */
  value: string;
  /** ABI-encoded calldata the wallet signs. */
  data: Hex;
  abi: { name: string; signature: string; args: unknown[] };
  description: string;
  warnings: string[];
  /** Never signed here. The agent's wallet must sign. */
  signedBy: "agent-wallet";
}

const STANDARD_WARNINGS = [
  "Unsigned intent. Review calldata and sign with your own wallet; this API never holds keys.",
  "Simulate (eth_call / eth_estimateGas) before broadcasting. Contracts revert on limit or pause.",
];

/**
 * Target addresses for an intent. Omitted names fall back to `NEXT_PUBLIC_*_ADDRESS`;
 * the chain-backed routes pass the reader's addresses so the intent targets the same
 * contracts the preflight was read from.
 */
export type IntentAddresses = Partial<Record<ContractName, `0x${string}` | null>>;

function intent(contract: ContractName, abiName: keyof typeof FUNCTION_SIGNATURES, data: Hex, args: unknown[], description: string, warnings: string[] = [], addresses: IntentAddresses = {}): TxIntent {
  const to = contract in addresses ? (addresses[contract] ?? null) : contractAddress(contract);
  return {
    to,
    contract,
    chainId: activeChain.id,
    value: "0",
    data,
    abi: { name: abiName, signature: FUNCTION_SIGNATURES[abiName], args },
    description,
    warnings: [...STANDARD_WARNINGS, ...(to ? [] : ["Preview only: contract address not configured (CONTRACTS_NOT_DEPLOYED)."]), ...warnings],
    signedBy: "agent-wallet",
  };
}

/* ---------------------------------------------------------------- builders */

export interface ChipLot {
  denomination: ChipDenomination;
  count: number;
}

export function chipLotsToIdsAmounts(lots: ChipLot[]) {
  const merged = new Map<ChipDenomination, number>();
  for (const l of lots) merged.set(l.denomination, (merged.get(l.denomination) ?? 0) + l.count);
  const entries = [...merged.entries()].filter(([, c]) => c > 0).sort((a, b) => a[0] - b[0]);
  return {
    ids: entries.map(([d]) => chipTokenIds[d]),
    amounts: entries.map(([, c]) => BigInt(c)),
    units: entries.reduce((s, [d, c]) => s + d * c, 0),
  };
}

export function buildApprovalIntent(addresses: IntentAddresses = {}): TxIntent {
  const treasury = "CasinoTreasury" in addresses ? (addresses.CasinoTreasury ?? null) : contractAddress("CasinoTreasury");
  const operator = treasury ?? ("0x0000000000000000000000000000000000000000" as const);
  const data = encodeFunctionData({ abi: erc1155ApprovalAbi, functionName: "setApprovalForAll", args: [operator, true] });
  return intent(
    "Chip1155",
    "setApprovalForAll",
    data,
    [operator, true],
    "One-time approval letting CasinoTreasury move your chips: escrow when you enter a table, burn when you redeem or convert them.",
    treasury ? [] : ["Operator address is the zero address until NEXT_PUBLIC_TREASURY_ADDRESS is set."],
    addresses,
  );
}

export function buildEnterTableIntent(lots: ChipLot[], addresses: IntentAddresses = {}) {
  const { ids, amounts, units } = chipLotsToIdsAmounts(lots);
  const data = encodeFunctionData({ abi: rouletteGameAbi, functionName: "enterTable", args: [ids, amounts] });
  return {
    intent: intent("RouletteGame", "enterTable", data, [ids.map(String), amounts.map(String)], `Escrow ${units} chip units (${ids.length} denominations) into RouletteGame.`, [
      "Requires a prior Chip1155.setApprovalForAll(treasury, true); see prerequisites.",
      "Gameplay can be paused by the operator; enterTable reverts while PAUSE_GAMEPLAY is set.",
    ], addresses),
    prerequisites: [buildApprovalIntent(addresses)],
    units,
  };
}

export function buildLeaveTableIntent(units: bigint, addresses: IntentAddresses = {}) {
  const data = encodeFunctionData({ abi: rouletteGameAbi, functionName: "leaveTable", args: [units] });
  return intent("RouletteGame", "leaveTable", data, [units.toString()], `Mint ${units} escrowed chip units back to your wallet.`, [
    "Not pausable by design: escrow can always be withdrawn. Reverts if units exceed your escrow balance.",
  ], addresses);
}

export function buildPlaceBetsIntent(roundId: bigint, bets: ContractBet[], summary: string, addresses: IntentAddresses = {}) {
  const data = encodeFunctionData({
    abi: rouletteGameAbi,
    functionName: "placeBets",
    args: [roundId, bets.map((b) => ({ numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake }))],
  });
  return intent("RouletteGame", "placeBets", data, [roundId.toString(), bets.map(contractBetToJson)], `Place ${bets.length} bet(s) on round ${roundId}: ${summary}.`, [
    "The round must be Open and your escrow must cover the total stake.",
    "The contract re-runs RiskEngine.checkWager over the whole round and reverts with ExposureCapExceeded if the table limit is reached.",
  ], addresses);
}

/**
 * CasinoTreasury.convertToRewards(ids, amounts): burns the caller's chips and credits
 * units × chipUsdValue (USD) to their win balance on the RewardVault. One-way: a win
 * balance can only be claimed as a reward asset (claimAs), never redeemed for ETH.
 */
export function buildConvertToRewardsIntent(lots: ChipLot[], addresses: IntentAddresses = {}) {
  const { ids, amounts, units } = chipLotsToIdsAmounts(lots);
  const data = encodeFunctionData({ abi: casinoTreasuryAbi, functionName: "convertToRewards", args: [ids, amounts] });
  return {
    intent: intent("CasinoTreasury", "convertToRewards", data, [ids.map(String), amounts.map(String)], `Burn ${units} chip units and credit their USD value at the chip peg to your win balance on the RewardVault.`, [
      "ONE-WAY: the chips are burned. A win balance can only be claimed as reward assets (claim intent); it cannot be converted back to chips or withdrawn as ETH. To take ETH out, redeem chips instead.",
      "Requires a prior Chip1155.setApprovalForAll(treasury, true); see prerequisites.",
      "Reverts while PAUSE_CLAIMS is set, and with RewardVaultNotSet when the treasury has no vault configured.",
      "Claims are paid from the vault's on-chain inventory: check GET /api/v1/rewards for what is claimable before converting.",
    ], addresses),
    prerequisites: [buildApprovalIntent(addresses)],
    units,
  };
}

export function buildClaimIntent(asset: `0x${string}`, usdAmount1e18: bigint, minOut: bigint, deadline: bigint, label: string, addresses: IntentAddresses = {}) {
  const data = encodeFunctionData({ abi: rewardVaultAbi, functionName: "claimAs", args: [asset, usdAmount1e18, minOut, deadline] });
  return intent(
    "RewardVault",
    "claimAs",
    data,
    [asset, usdAmount1e18.toString(), minOut.toString(), deadline.toString()],
    `Claim ${label} of win balance as asset ${asset}.`,
    [
      minOut === 0n ? "minOut is 0: no slippage protection against oracle moves. Set a minimum token amount." : "minOut protects against oracle price moves between quote and execution.",
      "Reverts if the asset is not registered/enabled, inventory is insufficient, or the deadline has passed.",
      "Stock Token settlement is subject to jurisdiction gates; the same rules apply to agents and humans.",
    ],
    addresses,
  );
}
