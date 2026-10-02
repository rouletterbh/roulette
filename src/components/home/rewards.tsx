import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { rewardRegistry, type RewardToken } from "@/config/tokens";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { TokenLogo } from "@/components/layout/brand-logo";
import { ChainRewardsTicker } from "./chain-rewards-ticker";

const statusLabel: Record<RewardToken["liquidityStatus"], string> = {
  available: "Available",
  low: "Low inventory",
  unavailable: "Temporarily unavailable",
  unverified: siteConfig.demoMode ? "Placeholder · dev" : "Not yet listed",
};

export function RewardsSection() {
  const list = [...rewardRegistry, ...rewardRegistry];
  return (
    <Section className="!px-0">
      <div className="container-edge grid items-end gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <Eyebrow className="mb-4 block">Rewards</Eyebrow>
          <h2 className="font-display text-display-md text-balance">One wheel. An entire market of rewards.</h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted md:text-lg">
            Wins land as a win balance. You choose how it settles: an ecosystem token on Robinhood Chain, or a supported Stock Token where available. Claims settle any hour, any day. Only assets the vault actually holds are ever offered.
          </p>
          <div className="mt-8 flex gap-3">
            <Button href="/rewards" variant="primary">See rewards</Button>
            <Button href="/treasury" variant="ghost">Reward inventory</Button>
          </div>
        </div>
        <div className="vignette overflow-hidden rounded-2xl">
          <picture>
            <source srcSet="/art/generated/rewards-light.webp" type="image/webp" />
            <img src="/art/generated/rewards-light.png" alt="Abstract chrome coins, a glowing green glass bar and a folded ticket shape floating beside a black roulette wheel." className="aspect-[3/2] w-full object-cover" loading="lazy" width={1536} height={1024} />
          </picture>
        </div>
      </div>

      {!siteConfig.demoMode ? (
        <ChainRewardsTicker />
      ) : (
      <div className="relative mt-14 overflow-hidden border-y border-hairline py-5" aria-label="Reward assets ticker">
        <div className="ticker-track flex w-max gap-3 px-3">
          {list.map((t, i) => (
            <Link
              key={`${t.id}-${i}`}
              href="/rewards"
              className="flex items-center gap-3 rounded-full border border-border bg-surface py-2 pl-2 pr-4 text-[13px] dark:bg-elevated"
            >
              <TokenLogo symbol={t.symbol} logoURI={t.logoURI} size={28} tone={t.category === "stock-token" ? "ink" : "accent"} />
              <span className="font-medium">{t.symbol}</span>
              <span className="text-muted">{t.category === "stock-token" ? "Stock Token" : "Robinhood Chain"}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", t.liquidityStatus === "available" ? "bg-accent" : t.liquidityStatus === "low" ? "bg-amber" : "bg-faint")} aria-hidden />
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted">{statusLabel[t.liquidityStatus]}</span>
            </Link>
          ))}
        </div>
      </div>
      )}
      <p className="container-edge mt-4 text-[11.5px] text-muted">
        Stock Token availability is jurisdiction-dependent and not available in all regions. Symbols shown are candidates in a registry, not promises of inventory. <Link href="/stock-token-disclosure" className="underline underline-offset-2">Read the disclosure</Link>.
      </p>
    </Section>
  );
}
