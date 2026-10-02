"use client";

import { WagmiProvider, useAccount, useChainId } from "wagmi";
import { useEffect } from "react";
import { wagmiConfig } from "@/lib/web3/wagmi";
import { siteConfig } from "@/config/site";
import { activeChain } from "@/config/chains";
import { useWallet } from "@/store/wallet";

/** Mirrors wagmi account state into the wallet store when running against a real chain. */
function WalletSync() {
  const { address, status } = useAccount();
  const chainId = useChainId();
  useEffect(() => {
    if (status === "connected" && address) {
      useWallet.setState({ status: chainId === activeChain.id ? "connected" : "wrong-network", address, isDemo: false });
    } else if (status === "disconnected") {
      useWallet.setState({ status: "disconnected", address: null, ensName: null, isDemo: false });
    }
  }, [address, status, chainId]);
  return null;
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  if (siteConfig.demoMode) return <>{children}</>;
  return (
    <WagmiProvider config={wagmiConfig}>
      <WalletSync />
      {children}
    </WagmiProvider>
  );
}
