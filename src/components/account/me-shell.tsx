"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { WalletButton } from "@/components/layout/wallet-button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DemoBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, shortAddress } from "@/lib/utils";

export const meNav = [
  { label: "Overview", href: "/me" },
  { label: "Chips", href: "/me/chips" },
  { label: "Rewards", href: "/me/rewards" },
  { label: "Game history", href: "/me/history" },
  { label: "Referrals", href: "/referrals" },
] as const;

export interface MeContext {
  address: `0x${string}`;
  ensName: string | null;
  displayName: string;
}

/**
 * Account layout. Requires a connected wallet; otherwise shows a connect
 * prompt. Desktop: sticky left sub-nav (+ optional in-page anchors). Mobile:
 * horizontally scrolling pill tabs.
 */
export function MeShell({
  title,
  eyebrow = "My account",
  lede,
  sections,
  children,
}: {
  title: string;
  eyebrow?: string;
  lede?: string;
  /** In-page anchors shown under the nav on desktop and as a second pill row on mobile. */
  sections?: ReadonlyArray<{ id: string; label: string }>;
  children: (ctx: MeContext) => React.ReactNode;
}) {
  const pathname = usePathname();
  const { status, address, ensName } = useWallet();
  const localName = useProfile((s) => s.displayName);
  const mounted = useMounted();
  const reduce = useReducedMotion();

  if (!mounted) {
    return (
      <div className="container-edge py-16 md:py-24">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-14 w-2/3 max-w-xl" />
        <Skeleton className="mt-12 h-[50vh] w-full rounded-2xl" />
      </div>
    );
  }

  if (status !== "connected" || !address) return <ConnectPrompt />;

  const displayName = localName || ensName || shortAddress(address);
  const ctx: MeContext = { address, ensName, displayName };

  return (
    <div className="container-edge py-12 md:py-20">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Eyebrow>{eyebrow}</Eyebrow>
            <DemoBadge />
          </div>
          <h1 className="mt-4 font-display text-display-md text-balance">{title}</h1>
          {lede && <p className="mt-4 max-w-lg text-[15px] text-muted md:text-base">{lede}</p>}
        </div>
        <div className="flex items-center gap-3">
          <PlayerAvatar address={address} size={36} name={displayName} />
          <div className="leading-tight">
            <p className="text-[14px] font-medium text-ink">{displayName}</p>
            <p className="font-mono text-[12px] tnum text-muted">{shortAddress(address, 6)}</p>
          </div>
        </div>
      </div>

      {/* Mobile pill tabs */}
      <nav aria-label="Account sections" className="mt-8 lg:hidden">
        <ul className="no-scrollbar -mx-4 flex snap-x gap-1 overflow-x-auto px-4">
          {meNav.map((n) => {
            const active = pathname === n.href;
            return (
              <li key={n.href} className="shrink-0 snap-start">
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("inline-flex rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors", active ? "border-ink bg-ink text-canvas" : "border-border text-muted hover:border-border-strong hover:text-ink")}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {sections && sections.length > 0 && (
          <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-4 overflow-x-auto px-4 text-[12.5px]">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0 snap-start">
                <a href={`#${s.id}`} className="text-muted underline-offset-4 hover:text-ink hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="mt-10 grid gap-12 lg:mt-16 lg:grid-cols-[200px_1fr] lg:gap-20">
        {/* Desktop sub-nav */}
        <nav aria-label="Account sections" className="hidden lg:block">
          <div className="sticky top-28 space-y-10">
            <ul className="space-y-1">
              {meNav.map((n) => {
                const active = pathname === n.href;
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("relative block rounded-md py-1.5 pl-4 text-[14px] transition-colors", active ? "text-ink" : "text-muted hover:text-ink")}
                    >
                      {active && (
                        <motion.span
                          layoutId="me-nav-bar"
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                          className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-ink"
                          aria-hidden
                        />
                      )}
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {sections && sections.length > 0 && (
              <div>
                <div className="eyebrow mb-3">On this page</div>
                <ol className="space-y-2 text-[13px]">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="text-muted transition-colors hover:text-ink">
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </nav>

        <div className="min-w-0">{children(ctx)}</div>
      </div>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="container-edge py-20 md:py-32">
      <div className="mx-auto max-w-xl text-center">
        <Eyebrow className="mb-4 block">My account</Eyebrow>
        <h1 className="font-display text-display-md text-balance">Your seat is held by your wallet.</h1>
        <p className="mt-5 text-base text-muted md:text-lg">
          Connect to see chips, win balance, claims and your round history. Nothing is stored on our side that the chain does not already know.
        </p>
        <div className="mt-8 flex justify-center">
          <WalletButton />
        </div>
        <p className="mt-8 text-[12.5px] text-faint">
          Demo mode uses a simulated wallet. No signature is requested and no funds move.
        </p>
      </div>
    </div>
  );
}

/** Section wrapper with an anchor and an editorial heading. */
export function MeSection({ id, title, description, action, children, className }: { id: string; title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 py-10 first:pt-0 hairline-b last:border-b-0", className)}>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id={`${id}-title`} className="font-display text-3xl">
            {title}
          </h2>
          {description && <p className="mt-2 max-w-lg text-[13.5px] text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
