"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { siteConfig } from "@/config/site";
import { track } from "@/lib/analytics/events";

/**
 * Wallet state. In DEMO mode a simulated wallet is used and clearly labeled.
 * Otherwise `connect`/`disconnect` dispatch to wagmi actions and `Web3Provider`
 * mirrors wagmi account state into this store, so UI code has one source of truth.
 */
export type WalletStatus = "disconnected" | "connecting" | "connected" | "wrong-network";

interface WalletState {
  status: WalletStatus;
  address: `0x${string}` | null;
  ensName: string | null;
  isDemo: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToActiveChain: () => Promise<void>;
}

const DEMO_ADDRESS = "0x23a1b9c0d4e5f60718293a4b5c6d7e8f9a0b1a91" as const;

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      status: "disconnected",
      address: null,
      ensName: null,
      isDemo: siteConfig.demoMode,
      connect: async () => {
        set({ status: "connecting" });
        if (siteConfig.demoMode) {
          await new Promise((r) => setTimeout(r, 900));
          set({ status: "connected", address: DEMO_ADDRESS, ensName: "you.eth", isDemo: true });
          track("wallet_connect", { demo: true });
          return;
        }
        try {
          const [{ connect }, { injected, walletConnect }, { wagmiConfig }] = await Promise.all([import("wagmi/actions"), import("wagmi/connectors"), import("@/lib/web3/wagmi")]);
          // Injected (browser extension / in-app) first; WalletConnect when no provider is injected and a project id is set.
          const hasInjected = typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum;
          const wcId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
          const connector = hasInjected || !wcId ? injected() : walletConnect({ projectId: wcId, showQrModal: true });
          await connect(wagmiConfig, { connector });
          // Robinhood Chain has no ENS: ensName stays null; Web3Provider mirrors address/status.
        } catch {
          set({ status: "disconnected" });
        }
      },
      disconnect: () => {
        set({ status: "disconnected", address: null, ensName: null });
        if (!siteConfig.demoMode) {
          void Promise.all([import("wagmi/actions"), import("@/lib/web3/wagmi")]).then(([{ disconnect }, { wagmiConfig }]) => disconnect(wagmiConfig));
        }
      },
      switchToActiveChain: async () => {
        if (siteConfig.demoMode) return;
        const [{ switchChain }, { wagmiConfig }, { activeChain }] = await Promise.all([import("wagmi/actions"), import("@/lib/web3/wagmi"), import("@/config/chains")]);
        await switchChain(wagmiConfig, { chainId: activeChain.id });
      },
    }),
    {
      name: "wallet-demo",
      partialize: (s) => (siteConfig.demoMode ? { status: s.status, address: s.address, ensName: s.ensName, isDemo: s.isDemo } : { isDemo: false }),
    },
  ),
);
