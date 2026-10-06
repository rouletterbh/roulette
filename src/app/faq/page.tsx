import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import { siteConfig } from "@/config/site";
import { robinhoodChain } from "@/config/chains";
import { TokenAddress } from "@/components/layout/token-address";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Getting started, play, rewards, blockchain and safety questions, answered plainly.",
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href}>{children}</Link>
);

const categories: Array<{ id: string; label: string; items: AccordionItem[] }> = [
  {
    id: "getting-started",
    label: "Getting started",
    items: [
      {
        id: "chips",
        question: "What are chips?",
        answer: (
          <>
            <p>
              Chips are ERC-1155 semi-fungible tokens on Robinhood Chain, one token id per denomination (1, 5, 10, 25, 50, 100). You receive them
              when you deposit and they sit in your own wallet. Tables escrow them during a round and release or settle them when the result is revealed.
            </p>
            <p>They are game pieces, not an investment: no yield, no governance, no claim on the protocol.</p>
          </>
        ),
      },
      {
        id: "wallet",
        question: "What wallet do I need?",
        answer: (
          <p>
            Any Ethereum-compatible wallet that can add a custom network. {siteConfig.name} connects through standard wallet interfaces; you keep
            your keys and sign every transaction yourself. Practice mode needs no wallet at all.
          </p>
        ),
      },
      {
        id: "network",
        question: "What network is used?",
        answer: (
          <p>
            Robinhood Chain (mainnet chain id {robinhoodChain.id}; testnet {46630}). Gas is paid in ETH. The interface currently targets the{" "}
            {siteConfig.chainEnv} environment. Details are on the <A href="/technology#chain">Technology page</A>.
          </p>
        ),
      },
      {
        id: "token",
        question: `Is there a ${siteConfig.token.symbol} token?`,
        answer: (
          <>
            <p>
              Yes: {siteConfig.token.name} ({siteConfig.token.symbol}) is the project token on Robinhood Chain. The only official contract is the one shown
              below; verify it on the explorer before interacting with anything that claims to be {siteConfig.token.symbol}.
            </p>
            <TokenAddress className="mt-3" />
            <p className="mt-3">
              You do not need {siteConfig.token.symbol} to play. It is one of the reward assets: winnings can be collected as {siteConfig.token.symbol} at the
              oracle price, from vault inventory that is bought on its launch curve with the ETH players convert. The <A href="/cashier?tab=claim">cashier</A> shows
              whether it is claimable right now; when the vault holds none, it is not offered. Nothing on this site is advice to buy it. Announcements come from{" "}
              <a href={siteConfig.socials.x.href} target="_blank" rel="noreferrer">X {siteConfig.socials.x.handle}</a> only.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "play",
    label: "Play",
    items: [
      {
        id: "roulette",
        question: "How does roulette work?",
        answer: (
          <>
            <p>
              A single-zero wheel has 37 pockets, 0 to 36. You place chips on numbers or groups of numbers; after the result, winning positions are
              paid at fixed odds (35:1 for a single number, 1:1 for red/black and so on) and losing chips go to the treasury.
            </p>
            <p>Every spin is independent. Previous results carry no information about the next one.</p>
          </>
        ),
      },
      {
        id: "outcomes",
        question: "How are outcomes generated?",
        answer: (
          <>
            <p>
              By commit–reveal. Before bets open the server publishes a hash of a secret seed. You contribute a player seed. After the round closes
              the seed is revealed and the result is <code>keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ roundId) mod 37</code>.
            </p>
            <p>You can recompute it from the published values and confirm the commitment matches. See <A href="/technology#fairness">Fairness</A>.</p>
          </>
        ),
      },
      {
        id: "free",
        question: "Can I play without money?",
        answer: (
          <p>
            Yes. <A href="/play/practice">Practice mode</A> uses free practice chips that have no value and never touch the chain. It runs the same
            wheel, bet types, payouts and fairness proof as a live table, needs no wallet and has no age gate.
          </p>
        ),
      },
    ],
  },
  {
    id: "rewards",
    label: "Rewards",
    items: [
      {
        id: "win",
        question: "What can I win?",
        answer: (
          <p>
            Wins are paid in chips at the table and recorded as claimable balances. When you claim, you may be offered settlement in crypto or in
            supported Stock Tokens, but only in assets the reward vault actually holds at that moment and only where your jurisdiction is enabled.
          </p>
        ),
      },
      {
        id: "claims",
        question: "How do claims work?",
        answer: (
          <p>
            Claims are pulled, never pushed. Your balance stays recorded against your address until you withdraw it, and nobody else can redirect it.
            If withdrawals are paused the balance remains owed to you; see <A href="/security#withdrawals">Withdrawal protections</A>.
          </p>
        ),
      },
      {
        id: "unavailable",
        question: "Why are some rewards unavailable?",
        answer: (
          <p>
            Because the vault does not hold enough of that asset, or because the asset is not enabled for your jurisdiction. We never offer a
            reward from inventory we do not have. Availability can change as inventory is bought or claimed.
          </p>
        ),
      },
    ],
  },
  {
    id: "blockchain",
    label: "Blockchain",
    items: [
      {
        id: "robinhood-chain",
        question: "What is Robinhood Chain?",
        answer: (
          <p>
            An Ethereum-compatible network. {siteConfig.name} uses it as public infrastructure. {siteConfig.name} is an independent product and is
            not operated, endorsed or sponsored by Robinhood.
          </p>
        ),
      },
      {
        id: "nfts",
        question: "Are chips NFTs?",
        answer: (
          <p>
            Not quite. They are ERC-1155 tokens, which can be fungible or non-fungible per token id. Chips are the fungible kind: every 25-chip is
            interchangeable with every other 25-chip. The standard is shared with NFTs; the chips themselves are not unique.
          </p>
        ),
      },
      {
        id: "verify",
        question: "Where can I verify transactions?",
        answer: (
          <p>
            On the public explorer at{" "}
            <a href={robinhoodChain.blockExplorers.default.url} target="_blank" rel="noreferrer">
              {robinhoodChain.blockExplorers.default.url.replace("https://", "")}
            </a>
            . Deposits, chip balances, round settlements and claims are all onchain events.
          </p>
        ),
      },
    ],
  },
  {
    id: "safety",
    label: "Safety",
    items: [
      {
        id: "run-out",
        question: "Can the protocol run out of money?",
        answer: (
          <>
            <p>
              Not through gameplay. Every wager is limited by available collateral before acceptance: the risk engine subtracts in-flight
              liabilities, unclaimed wins, the operating reserve and a safety reserve from the bankroll, then caps any single round at a fraction of
              what remains. A bet the treasury could not pay is declined, not accepted.
            </p>
            <p>
              What this does not protect against is a bug in unreviewed code. The contracts are <A href="/security#audits">not yet audited</A>.
            </p>
          </>
        ),
      },
      {
        id: "max-bets",
        question: "How are maximum bets determined?",
        answer: (
          <p>
            From the live treasury: <code>maxStake = availableBankroll × exposureCap ÷ payoutMultiplier</code>. Higher-paying bets get smaller
            caps because the treasury would owe more if they won. The limit is recomputed before every bet and shown on the table. Details on{" "}
            <A href="/how-it-works#limits">How it works</A>.
          </p>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">FAQ</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Questions, answered plainly.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          If something here reads like marketing, tell us. The goal is that every answer could be checked against the chain.
        </p>
      </div>

      <nav aria-label="Categories" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
        {categories.map((c) => (
          <a key={c.id} href={`#${c.id}`} className="transition-colors hover:text-ink">
            {c.label}
          </a>
        ))}
      </nav>

      <div className="mt-10 max-w-4xl">
        {categories.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-28 grid gap-4 py-12 md:grid-cols-[200px_minmax(0,1fr)] md:gap-16" aria-labelledby={`${c.id}-h`}>
            <h2 id={`${c.id}-h`} className="eyebrow md:sticky md:top-28 md:self-start">
              {c.label}
            </h2>
            <Accordion items={c.items} />
          </section>
        ))}
      </div>

      <p className="mt-8 max-w-xl text-[13.5px] text-muted">
        Still unsure? Read <Link href="/how-it-works" className="text-ink underline underline-offset-2">How it works</Link>, or set up{" "}
        <Link href="/responsible-play" className="text-ink underline underline-offset-2">responsible-play limits</Link> before you sit down.
      </p>
    </div>
  );
}
