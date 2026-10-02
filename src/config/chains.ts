import { defineChain } from "viem";

/**
 * Robinhood Chain definitions. Always write "Robinhood Chain".
 * Mainnet 4663, Testnet 46630. Native gas asset: ETH.
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    // Testnet RPC is intentionally read from env so it is never guessed.
    default: {
      http: [process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC ?? ""].filter(Boolean),
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_EXPLORER ?? "https://robinhoodchain.blockscout.com",
    },
  },
  testnet: true,
});

export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN_ENV === "mainnet" ? robinhoodChain : robinhoodChainTestnet;

export function explorerTx(hash: string, chain = activeChain) {
  return `${chain.blockExplorers.default.url}/tx/${hash}`;
}
export function explorerAddress(addr: string, chain = activeChain) {
  return `${chain.blockExplorers.default.url}/address/${addr}`;
}
