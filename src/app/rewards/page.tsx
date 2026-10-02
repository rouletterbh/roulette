import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";
import { RewardCard } from "@/components/rewards/reward-card";
import { getRewardInventory } from "@/lib/demo/rewards";

export const metadata: Metadata = { title: "Rewards" };

export default function RewardsPage() {
  const inv = getRewardInventory();
  const groups = [
    { title: "Ecosystem tokens", sub: "Assets on Robinhood Chain held by the reward vault.", items: inv.filter((i) => i.token.category === "crypto") },
    { title: "Stock Tokens", sub: "Offered only where the vault holds inventory and your jurisdiction is enabled.", items: inv.filter((i) => i.token.category === "stock-token") },
  ];
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="grid items-end gap-10 lg:grid-cols-2">
        <div>
          <Eyebrow className="mb-4 block">Rewards</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">One wheel. An entire market of rewards.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">You win a balance, not a token. Then you choose how it settles, from whatever the vault actually holds. We never display a reward we can&apos;t deliver.</p>
          <div className="mt-8 flex items-center gap-3">
            <Button href="/cashier?tab=claim" variant="accent">Claim a win</Button>
            <Button href="/treasury" variant="ghost">Vault inventory</Button>
            <DemoBadge />
          </div>
        </div>
        <div className="vignette overflow-hidden rounded-2xl">
          <picture><source srcSet="/art/generated/rewards-light.webp" type="image/webp" /><img src="/art/generated/rewards-light.png" alt="Abstract chrome coins, a green glass bar and a folded ticket shape floating beside a black roulette wheel." className="aspect-[3/2] w-full object-cover" width={1536} height={1024} /></picture>
        </div>
      </div>

      {groups.map((gp) => (
        <section key={gp.title} className="mt-20">
          <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <h2 className="font-display text-3xl">{gp.title}</h2>
            <p className="text-[13px] text-muted">{gp.sub}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{gp.items.map((i) => <RewardCard key={i.token.id} item={i} />)}</div>
        </section>
      ))}

      <p className="mt-12 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        Stock Tokens are blockchain-based instruments whose availability depends on your jurisdiction. They are not available in all regions and this page does not imply availability anywhere in particular. Token quantities are never promised before a quote at settlement. <Link href="/stock-token-disclosure" className="underline underline-offset-2">Read the Stock Token disclosure</Link>.
      </p>
    </div>
  );
}
