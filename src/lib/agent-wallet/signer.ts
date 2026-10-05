import { createPublicClient, createWalletClient, http, type Chain, type PublicClient, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "@/config/chains";
import { contractAddresses } from "@/lib/web3/contracts";
import type { AgentChainIO } from "./chain-io";
import { readAgentPrivateKey, type KeyStorage, browserKeyStorage } from "./keystore";
import { createViemAgentIO, type AgentContracts } from "./viem-io";

/**
 * Turns a stored agent key into chain I/O. This is the only place (besides the
 * owner's explicit export) where the private key is read; it goes straight into a
 * viem local account and is not kept in any other variable, store or log.
 */
let sharedPublic: PublicClient | null = null;

/** One public client for every agent wallet in this tab (reads are batched through Multicall3 where the chain has it). */
export function agentPublicClient(chain: Chain = activeChain): PublicClient {
  if (chain !== activeChain) return createPublicClient({ chain, transport: http(), batch: chain.contracts?.multicall3 ? { multicall: true } : undefined });
  sharedPublic ??= createPublicClient({ chain, transport: http(), batch: chain.contracts?.multicall3 ? { multicall: true } : undefined });
  return sharedPublic;
}

export function configuredAgentContracts(): AgentContracts | null {
  const { game, chip, treasury, randomness, rewardVault } = contractAddresses;
  if (!game || !chip || !treasury) return null;
  return { game, chip, treasury, randomness, rewardVault };
}

export function agentIOFor(seatId: string, opts: { chain?: Chain; contracts?: AgentContracts; storage?: KeyStorage | null; publicClient?: PublicClient; transport?: Transport } = {}): AgentChainIO | null {
  const chain = opts.chain ?? activeChain;
  const contracts = opts.contracts ?? configuredAgentContracts();
  if (!contracts) return null;
  const key = readAgentPrivateKey(seatId, opts.storage === undefined ? browserKeyStorage() : opts.storage);
  if (!key) return null;
  const account = privateKeyToAccount(key);
  const publicClient = opts.publicClient ?? agentPublicClient(chain);
  const walletClient = createWalletClient({ account, chain, transport: opts.transport ?? http() });
  return createViemAgentIO({ publicClient, walletClient, account, chain, contracts });
}
