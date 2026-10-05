import { getBalance, getTransaction, getTransactionReceipt, readContract, sendTransaction, simulateContract, writeContract } from "wagmi/actions";
import { pollReceipt } from "@/lib/web3/receipt";
import type { Address, Hex } from "viem";
import { activeChain } from "@/config/chains";
import { wagmiConfig } from "@/lib/web3/wagmi";
import { connectedAccount, type TxReporter } from "@/lib/web3/actions";
import { TxError, toTxError } from "@/lib/web3/errors";
import { CHIP_IDS, balancesFromBatch, chip1155Abi, contractAddresses, rouletteGameAbi, selectChips } from "@/lib/web3/contracts";

/**
 * The two transactions the OWNER signs to fund an agent wallet, in the shape the
 * TransactionModal / useTxFlow pattern expects (same step reporting as
 * src/lib/web3/actions.ts).
 *
 *   1. a plain ETH transfer of the gas float to the agent address,
 *   2. Chip1155.safeBatchTransferFrom(owner, agent, ids, amounts, "0x") for the allowance.
 *
 * Gas goes first on purpose: if the owner stops after one signature, an agent that
 * holds only ETH can send it back by itself, whereas chips without gas would be stuck
 * until more ETH is sent. Both steps look at what the agent already holds and skip
 * what is already there, so re-running a half-finished funding never double-funds.
 */
const chainId = activeChain.id;

async function track(report: TxReporter, write: () => Promise<Hex>): Promise<Hex> {
  report("confirm-wallet");
  const hash = await write();
  report("submitted", { hash });
  report("confirming", { hash });
  const outcome = await pollReceipt(hash, {
    getReceipt: (h) => getTransactionReceipt(wagmiConfig, { hash: h, chainId }),
    isKnown: (h) => getTransaction(wagmiConfig, { hash: h, chainId }).then(() => true, () => false),
  });
  if (outcome.kind === "timeout") {
    // A wallet can return a hash for a transaction that never reaches the network (seen on mainnet: the
    // node did not know the hash and the nonce never advanced). Say so instead of spinning forever.
    if (!outcome.known) throw new TxError("dropped", "The network never saw this transaction. Your wallet may not have broadcast it; nothing was charged. Try again.");
    throw new TxError("timeout", "Still waiting for the network to include this transaction. Check the explorer link before retrying.");
  }
  if (outcome.status !== "success") throw new TxError("reverted", "Transaction reverted on chain.");
  return hash;
}

export interface FundAgentInput {
  agent: Address;
  /** Chip units the agent should end up holding (wallet + escrow). */
  allowanceUnits: number;
  /** ETH the agent should end up holding at least. */
  gasFloatWei: bigint;
}

/** What funding still has to send, from the agent's current chain balances. */
export async function fundingGap(input: FundAgentInput): Promise<{ chipsMissing: number; ethMissing: bigint }> {
  const chip = contractAddresses.chip;
  const game = contractAddresses.game;
  if (!chip || !game) throw new TxError("unknown", "Contract addresses are not configured (NEXT_PUBLIC_*_ADDRESS).");
  const [raw, escrow, eth] = await Promise.all([
    readContract(wagmiConfig, { abi: chip1155Abi, address: chip, functionName: "balanceOfBatch", args: [CHIP_IDS.map(() => input.agent), [...CHIP_IDS]], chainId }),
    readContract(wagmiConfig, { abi: rouletteGameAbi, address: game, functionName: "escrow", args: [input.agent], chainId }),
    getBalance(wagmiConfig, { address: input.agent, chainId }),
  ]);
  const held = CHIP_IDS.reduce((s, id, i) => s + Number(id - 1000n) * Number(raw[i] ?? 0n), 0) + Number(escrow);
  return { chipsMissing: Math.max(0, input.allowanceUnits - held), ethMissing: eth.value >= input.gasFloatWei ? 0n : input.gasFloatWei - eth.value };
}

/**
 * Fund the agent: gas float, then chips. Two owner signatures (fewer when part of it is
 * already there). Resolves with the hash of the last transaction sent.
 */
export async function fundAgent(input: FundAgentInput, report: TxReporter): Promise<Hex> {
  try {
    const { address: owner } = connectedAccount();
    const chip = contractAddresses.chip;
    if (!chip) throw new TxError("unknown", "Chip1155 address is not configured (NEXT_PUBLIC_*_ADDRESS).");
    if (owner.toLowerCase() === input.agent.toLowerCase()) throw new TxError("unknown", "The agent wallet cannot fund itself.");
    const gap = await fundingGap(input);
    let last: Hex | null = null;

    if (gap.ethMissing > 0n) {
      last = await track(report, () => sendTransaction(wagmiConfig, { to: input.agent, value: gap.ethMissing, chainId }));
    }
    if (gap.chipsMissing > 0) {
      const raw = await readContract(wagmiConfig, { abi: chip1155Abi, address: chip, functionName: "balanceOfBatch", args: [CHIP_IDS.map(() => owner), [...CHIP_IDS]], chainId });
      const sel = selectChips(balancesFromBatch(raw), gap.chipsMissing);
      if (!sel.exact) {
        throw new TxError("insufficient-chips", sel.units > 0 ? `Your wallet's chip denominations can cover ${sel.units} of the ${gap.chipsMissing} chips. Chips at a table are in escrow: cash out first, or lower the allowance.` : "Your wallet holds no chips to send. Chips at a table are in escrow: cash out first.");
      }
      const { request } = await simulateContract(wagmiConfig, { abi: chip1155Abi, address: chip, functionName: "safeBatchTransferFrom", args: [owner, input.agent, sel.ids, sel.amounts, "0x"], account: owner, chainId });
      last = await track(report, () => writeContract(wagmiConfig, request));
    }
    if (!last) throw new TxError("unknown", "The agent wallet already holds its allowance and gas. Nothing to send.");
    report("complete", { hash: last });
    return last;
  } catch (e) {
    const err = toTxError(e);
    report("failed");
    throw err;
  }
}

/** A plain ETH top-up for an agent that ran out of gas before it could send funds back. */
export async function topUpAgentGas(agent: Address, valueWei: bigint, report: TxReporter): Promise<Hex> {
  try {
    connectedAccount();
    const hash = await track(report, () => sendTransaction(wagmiConfig, { to: agent, value: valueWei, chainId }));
    report("complete", { hash });
    return hash;
  } catch (e) {
    const err = toTxError(e);
    report("failed");
    throw err;
  }
}
