"use client";

import { AnimatePresence, motion } from "motion/react";
import { useWallet } from "@/store/wallet";
import { shortAddress, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import Link from "next/link";
import { PlayerAvatar } from "@/components/player/player-avatar";

export function WalletButton({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const { status, address, ensName, connect, disconnect, isDemo, switchToActiveChain } = useWallet();
  const [open, setOpen] = useState(false);
  const mounted = useMounted();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (mounted && status === "wrong-network") {
    return (
      <Button variant="danger" size={size} onClick={switchToActiveChain} className={className}>
        Switch to Robinhood Chain
      </Button>
    );
  }

  if (!mounted || status === "disconnected" || status === "connecting") {
    return (
      <Button variant="primary" size={size} onClick={connect} disabled={status === "connecting"} className={className}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {status === "connecting" ? "Connecting…" : "Connect Wallet"}
          </motion.span>
        </AnimatePresence>
      </Button>
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-surface pl-1.5 pr-3.5 text-sm font-medium transition-colors hover:border-border-strong dark:bg-elevated"
      >
        <PlayerAvatar address={address!} size={28} />
        <span className="tnum">{ensName ?? shortAddress(address!)}</span>
        {isDemo && <span className="rounded-full border border-dashed border-border-strong px-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">Demo</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-lg dark:bg-elevated"
          >
            {[
              { label: "My account", href: "/me" },
              { label: "Cashier", href: "/cashier" },
              { label: "Game history", href: "/me/history" },
              { label: "Rewards", href: "/me/rewards" },
            ].map((i) => (
              <Link key={i.href} href={i.href} role="menuitem" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-sunken dark:hover:bg-surface">
                {i.label}
              </Link>
            ))}
            <div className="my-1 hairline-t" />
            <button role="menuitem" onClick={() => { disconnect(); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-sunken dark:hover:bg-surface">
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
