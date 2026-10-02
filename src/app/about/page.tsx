import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "About",
  description: "Roulette, rebuilt onchain. Chips onchain, transparent settlement, social tables, open financial infrastructure.",
};

const principles = [
  {
    n: "01",
    title: "Chips live onchain.",
    body: "Deposits become ERC-1155 chips in your own wallet on Robinhood Chain. They are not a balance in our database; they are tokens you hold and can inspect on a public explorer.",
  },
  {
    n: "02",
    title: "Settlement is transparent.",
    body: "Every round is committed before bets open and revealed after. Payouts follow published odds, and the record of what happened is public, not a line in a support ticket.",
  },
  {
    n: "03",
    title: "Tables are social.",
    body: "One wheel, one result, everyone watching. Sit at a public table, open a private one for friends, or practice alone for free. The game is the same in every room.",
  },
  {
    n: "04",
    title: "Built on open financial infrastructure.",
    body: `${siteConfig.name} is an independent product built on Robinhood Chain. It is not operated, endorsed or sponsored by Robinhood. We use the chain the way anyone can: as public infrastructure.`,
  },
  {
    n: "05",
    title: "Rewards come from inventory we actually hold.",
    body: "Wins can settle in crypto or in supported Stock Tokens, but only from assets the reward vault already holds and only where your jurisdiction is enabled. We never promise an asset we have not bought.",
  },
];

export default function AboutPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">About {siteConfig.name}</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Roulette, rebuilt onchain.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          A social roulette club where the chips, the result and the payout all live on a public chain. Nothing more, nothing hidden.
        </p>
      </div>

      <ol className="mt-20 max-w-3xl divide-y divide-hairline hairline-t hairline-b">
        {principles.map((p) => (
          <li key={p.n} className="grid gap-4 py-10 md:grid-cols-[96px_1fr] md:gap-10">
            <span className="font-display text-5xl text-faint">{p.n}</span>
            <div>
              <h2 className="font-display text-3xl leading-tight md:text-4xl">{p.title}</h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-20 max-w-3xl md:grid md:grid-cols-[96px_1fr] md:gap-10">
        <div className="hidden md:block" />
        <div>
          <h2 className="eyebrow mb-4">What we do not claim</h2>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted">
            We do not claim the protocol is fully decentralized: the game contracts are in development, ownership is intended to move to a multisig,
            and an emergency pause exists. We do not claim a license or an audit; neither has been obtained yet. We do not claim real-money play is
            available anywhere until counsel confirms it for a specific jurisdiction.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/how-it-works" variant="outline">How it works</Button>
            <Button href="/technology" variant="ghost">Technology</Button>
            <Button href="/security" variant="ghost">Security</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
