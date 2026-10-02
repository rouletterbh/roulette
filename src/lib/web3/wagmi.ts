import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { robinhoodChain, robinhoodChainTestnet } from "@/config/chains";

const wcId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/** wagmi config for Robinhood Chain. Used only when NEXT_PUBLIC_DEMO_MODE !== "true". */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain, robinhoodChainTestnet],
  connectors: [injected(), ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true })] : [])],
  transports: {
    [robinhoodChain.id]: http(),
    [robinhoodChainTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
