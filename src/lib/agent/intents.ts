import { encodeFunctionData, isAddress, type Hex } from "viem";
import { activeChain } from "@/config/chains";
import { chipTokenIds, type ChipDenomination } from "@/config/tokens";
import { contractBetToJson, type ContractBet } from "./encode-bets";

/**
 * Unsigned transaction intents. This module never holds a key and never signs:
 * it returns calldata the agent's own wallet must review and sign. Minimal ABIs
 * are derived from contracts/src/RouletteGame.sol, RewardVault.sol and Chip1155.sol.
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

export const rouletteGameAbi = [
  {
    type: "function",
    name: "enterTable",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ids", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "leaveTable",
    stateMutability: "nonpayable",
    inputs: [{ name: "units", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "placeBets",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      {
        name: "bets",
        type: "tuple[]",
        components: [
          { name: "numbersMask", type: "uint64" },
          { name: "multiplier", type: "uint16" },
          { name: "stake", type: "uint128" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const rewardVaultAbi = [
  {
    type: "function",
    name: "claimAs",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "usdAmount", type: "uint256" },
      { name: "minOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export const erc1155ApprovalAbi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export const FUNCTION_SIGNATURES = {
  enterTable: "enterTable(uint256[] ids,uint256[] amounts)",
  leaveTable: "leaveTable(uint256 units)",
  placeBets: "placeBets(uint256 roundId,(uint64 numbersMask,uint16 multiplier,uint128 stake)[] bets)",
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

function intent(contract: ContractName, abiName: keyof typeof FUNCTION_SIGNATURES, data: Hex, args: unknown[], description: string, warnings: string[] = []): TxIntent {
  const to = contractAddress(contract);
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

export function buildApprovalIntent(): TxIntent {
  const treasury = contractAddress("CasinoTreasury");
  const operator = treasury ?? ("0x0000000000000000000000000000000000000000" as const);
  const data = encodeFunctionData({ abi: erc1155ApprovalAbi, functionName: "setApprovalForAll", args: [operator, true] });
  return intent(
    "Chip1155",
    "setApprovalForAll",
    data,
    [operator, true],
    "One-time approval letting CasinoTreasury escrow your chips when you enter a table.",
    treasury ? [] : ["Operator address is the zero address until NEXT_PUBLIC_TREASURY_ADDRESS is set."],
  );
}

export function buildEnterTableIntent(lots: ChipLot[]) {
  const { ids, amounts, units } = chipLotsToIdsAmounts(lots);
  const data = encodeFunctionData({ abi: rouletteGameAbi, functionName: "enterTable", args: [ids, amounts] });
  return {
    intent: intent("RouletteGame", "enterTable", data, [ids.map(String), amounts.map(String)], `Escrow ${units} chip units (${ids.length} denominations) into RouletteGame.`, [
      "Requires a prior Chip1155.setApprovalForAll(treasury, true); see prerequisites.",
      "Gameplay can be paused by the operator; enterTable reverts while PAUSE_GAMEPLAY is set.",
    ]),
    prerequisites: [buildApprovalIntent()],
    units,
  };
}

export function buildLeaveTableIntent(units: bigint) {
  const data = encodeFunctionData({ abi: rouletteGameAbi, functionName: "leaveTable", args: [units] });
  return intent("RouletteGame", "leaveTable", data, [units.toString()], `Mint ${units} escrowed chip units back to your wallet.`, [
    "Not pausable by design: escrow can always be withdrawn. Reverts if units exceed your escrow balance.",
  ]);
}

export function buildPlaceBetsIntent(roundId: bigint, bets: ContractBet[], summary: string) {
  const data = encodeFunctionData({
    abi: rouletteGameAbi,
    functionName: "placeBets",
    args: [roundId, bets.map((b) => ({ numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake }))],
  });
  return intent("RouletteGame", "placeBets", data, [roundId.toString(), bets.map(contractBetToJson)], `Place ${bets.length} bet(s) on round ${roundId}: ${summary}.`, [
    "The round must be Open and your escrow must cover the total stake.",
    "The contract re-runs RiskEngine.checkWager over the whole round and reverts with ExposureCapExceeded if the table limit is reached.",
  ]);
}

export function buildClaimIntent(asset: `0x${string}`, usdAmount1e18: bigint, minOut: bigint, deadline: bigint, label: string) {
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
  );
}
