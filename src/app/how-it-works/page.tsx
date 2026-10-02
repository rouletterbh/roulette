import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { economicsDefaults } from "@/config/economics";

export const metadata: Metadata = {
  title: "How it works",
  description: "Deposit, get chips, play, win, claim. How a round moves through the system and how table limits are set.",
};

const steps = [
  {
    n: "01",
    title: "Deposit",
    lede: "Send ETH or a supported asset on Robinhood Chain.",
    body: "Your deposit goes to the CasinoTreasury contract. By default it is split into payout liquidity, reward inventory, an operating reserve and a small platform fee; the split is published on the Treasury page and bounded by configuration limits. Nothing is held in a private bank account.",
  },
  {
    n: "02",
    title: "Get chips",
    lede: "Chips are minted to your wallet as ERC-1155 gaming assets.",
    body: "Each denomination (1, 5, 10, 25, 50, 100) is its own token id in the Chip1155 contract. Chips sit in your wallet, not in ours, and you can see them on the public explorer. They are game pieces: they carry no yield and are not an investment.",
  },
  {
    n: "03",
    title: "Play",
    lede: "Sit at a public table, open a private one, or practice free.",
    body: "Before any bet is accepted the table asks the risk engine whether the treasury can cover the worst case. If it can, your chips move into round escrow. If it cannot, the bet is declined with the current limit shown; nothing is taken.",
  },
  {
    n: "04",
    title: "Win",
    lede: "Results are committed before bets open and verifiable after.",
    body: "The server commits a hash of its seed before bets open, you contribute a seed, and the result is derived from both plus a block reference once the round closes. You can recompute it yourself. Every spin is independent: no number is ever \"due\".",
  },
  {
    n: "05",
    title: "Claim",
    lede: "Choose how your win settles: crypto or supported Stock Tokens.",
    body: "Winnings are recorded as claimable balances; you pull them when you choose rather than having them pushed to you. Settlement in a particular asset is offered only when the reward vault actually holds it and your jurisdiction is enabled for it.",
  },
];

const exposureCap = economicsDefaults.maxRoundExposureBps / 100;
const safetyReserve = economicsDefaults.safetyReserveBps / 100;

export default function HowItWorksPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">How it works</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Three steps to the table. Two to the bank.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          The whole flow, from a deposit on Robinhood Chain to a claim, and the one rule that governs every bet in between.
        </p>
      </div>

      <ol className="mt-20 max-w-4xl divide-y divide-hairline hairline-t hairline-b">
        {steps.map((s) => (
          <li key={s.n} className="grid gap-4 py-12 md:grid-cols-[96px_minmax(0,1fr)] md:gap-10">
            <span className="font-display text-5xl text-faint">{s.n}</span>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-12">
              <div>
                <h2 className="font-display text-4xl leading-none">{s.title}</h2>
                <p className="mt-3 text-[15px] text-ink-2">{s.lede}</p>
              </div>
              <p className="text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Table limits */}
      <section className="mt-28 max-w-4xl md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-10" aria-labelledby="limits">
        <div className="hidden md:block" />
        <div>
          <Eyebrow className="mb-4 block">Table limits</Eyebrow>
          <h2 id="limits" className="font-display text-display-sm text-balance">
            Every wager is limited by available collateral before acceptance.
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            There is no fixed table maximum written on a sign. The limit is recomputed before each bet from what the treasury can actually pay if
            that bet wins, so the protocol can never accept a liability it cannot cover.
          </p>

          <dl className="mt-10 divide-y divide-hairline hairline-t hairline-b font-mono text-[13px] leading-relaxed">
            <div className="grid gap-2 py-4 md:grid-cols-[180px_1fr]">
              <dt className="font-sans text-[13px] text-muted">Available bankroll</dt>
              <dd>availableBankroll = bankroll − reserved − claimable − protocolReserve − safetyReserve</dd>
            </div>
            <div className="grid gap-2 py-4 md:grid-cols-[180px_1fr]">
              <dt className="font-sans text-[13px] text-muted">Round exposure cap</dt>
              <dd>maxRoundExposure = availableBankroll × exposureCap</dd>
            </div>
            <div className="grid gap-2 py-4 md:grid-cols-[180px_1fr]">
              <dt className="font-sans text-[13px] text-muted">Maximum stake</dt>
              <dd>maxStake = (maxRoundExposure − existingLiability) ÷ payoutMultiplier</dd>
            </div>
            <div className="grid gap-2 py-4 md:grid-cols-[180px_1fr]">
              <dt className="font-sans text-[13px] text-muted">Acceptance test</dt>
              <dd>maximumLiabilityAfterBet ≤ maxRoundExposure</dd>
            </div>
          </dl>

          <ul className="mt-8 max-w-xl space-y-3 text-[14.5px] leading-relaxed text-muted">
            <li>
              <strong className="font-medium text-ink">Reserved</strong> is what in-flight rounds could already owe; <strong className="font-medium text-ink">claimable</strong> is what players have won but not yet pulled. Both are subtracted first.
            </li>
            <li>
              A <strong className="font-medium text-ink">safety reserve</strong> ({safetyReserve}% of bankroll by default) is never exposed to any round, and no single round may risk more than the{" "}
              <strong className="font-medium text-ink">exposure cap</strong> ({exposureCap}% of what remains).
            </li>
            <li>
              Because the maximum stake divides by the payout multiplier, a straight-up bet (35:1) has a far smaller cap than an even-money bet. A table whose available bankroll falls below {economicsDefaults.minBankrollToOpen} USD-equivalent does not open at all.
            </li>
            <li>The same arithmetic is used by the interface, the tests and the intended RiskEngine contract, so the number you see is the number that is enforced.</li>
          </ul>
          <div className="mt-8">
            <Button href="/technology#solvency" variant="outline">Read the solvency engine</Button>
          </div>
        </div>
      </section>

      {/* Practice */}
      <section className="mt-28 max-w-4xl md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-10" aria-labelledby="practice">
        <div className="hidden md:block" />
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Eyebrow>Practice mode</Eyebrow>
            <Badge tone="outline">Free</Badge>
          </div>
          <h2 id="practice" className="font-display text-display-sm text-balance">Same wheel. Same proof. No money.</h2>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            Practice chips are issued in the browser, have no monetary value and never touch the chain. The wheel order, the bet types, the payout
            table and the commit–reveal proof are identical to a live table, so what you learn transfers directly. Practice is available
            everywhere, needs no wallet and has no age gate, because nothing of value is at stake.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/play/practice" variant="accent">Start practice</Button>
            <Button href="/cashier" variant="outline">Go to the cashier</Button>
          </div>
          <p className="mt-6 text-[13px] text-muted">
            Real-money play with {siteConfig.name} is subject to the{" "}
            <Link href="/restricted-jurisdictions" className="underline underline-offset-2">jurisdiction gate</Link> and the{" "}
            <Link href="/responsible-play" className="underline underline-offset-2">responsible-play controls</Link> you set.
          </p>
        </div>
      </section>
    </div>
  );
}
