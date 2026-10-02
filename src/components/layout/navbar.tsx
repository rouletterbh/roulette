"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { NetworkStatus } from "./network-status";
import { WalletButton } from "./wallet-button";
import { Button } from "@/components/ui/button";
import { useDock } from "@/store/dock";
import { useMyAgent } from "@/components/agent/use-my-agent";
import { AgentGlyph } from "@/components/agent/agent-glyph";
import { AgentStatus } from "@/components/agent/agent-status";
import { useMounted } from "@/lib/hooks/use-mounted";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mounted = useMounted();
  const { seat, state } = useMyAgent();
  const activityOpen = useDock((s) => s.activityOpen);
  const setActivityOpen = useDock((s) => s.setActivityOpen);
  const setDockOpen = useDock((s) => s.setOpen);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => { document.documentElement.style.overflow = ""; };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-b border-hairline bg-canvas/85 backdrop-blur-md" : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container-edge flex h-16 items-center justify-between gap-6 md:h-[72px]">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {siteConfig.nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-3.5 py-2 font-mono text-[11.5px] uppercase tracking-[0.12em] transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {item.label}
                {active && (
                  <motion.span layoutId="nav-underline" className="absolute inset-x-3.5 -bottom-px h-px bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 md:gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            <NetworkStatus />
            <button type="button" onClick={() => setActivityOpen(!activityOpen)} aria-pressed={activityOpen} className={cn("font-mono text-[11.5px] uppercase tracking-[0.12em] transition-colors", activityOpen ? "text-ink" : "text-muted hover:text-ink")}>Activity</button>
            {mounted && seat && (
              <button type="button" onClick={() => setDockOpen(true)} className="flex items-center gap-2 border border-border px-2 py-1 transition-colors hover:border-ink" aria-label={`${seat.code} agent`}>
                <AgentGlyph seed={seat.id} state={state} size={18} className="text-ink" />
                <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{seat.code}</span>
                <AgentStatus state={state} />
              </button>
            )}
            <ThemeToggle />
            <WalletButton />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <span className="relative block h-3 w-4">
              <span className={cn("absolute left-0 top-0 h-px w-4 bg-ink transition-transform duration-300", open && "translate-y-[6px] rotate-45")} />
              <span className={cn("absolute left-0 top-[6px] h-px w-4 bg-ink transition-opacity duration-200", open && "opacity-0")} />
              <span className={cn("absolute left-0 top-3 h-px w-4 bg-ink transition-transform duration-300", open && "-translate-y-[6px] -rotate-45")} />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-full z-40 flex h-[calc(100dvh-4rem)] flex-col overflow-y-auto bg-canvas md:hidden"
          >
            <nav className="container-edge flex flex-col pt-4" aria-label="Mobile">
              {siteConfig.nav.map((item, i) => (
                <motion.div key={item.href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-hairline py-5 font-display text-4xl">
                    {item.label}
                    <span className="text-muted" aria-hidden>→</span>
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="container-edge mt-auto flex flex-col gap-4 pb-8">
              <div className="flex items-center justify-between">
                <NetworkStatus />
                <ThemeToggle />
              </div>
              <WalletButton className="w-full" />
              <Button href="/play/practice" variant="outline" className="w-full">Try practice mode</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
