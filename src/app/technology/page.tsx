import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchitectureDiagram } from "@/components/technology/architecture-diagram";
import { siteConfig } from "@/config/site";
import { economicsDefaults } from "@/config/economics";
import { robinhoodChain, robinhoodChainTestnet } from "@/config/chains";

export const metadata: Metadata = {
  title: "Technology",
  description: "Robinhood Chain, ERC-1155 chips, the contract set, commit–reveal fairness, the reward vault and the solvency engine.",
};

const contracts = [
  { name: "CasinoTreasury", role: "Receives deposits, holds the bankroll and reserves, and is the only contract that pays out. Exposes the snapshot the risk engine reads." },
  { name: "Chip1155", role: "ERC-1155 token with one id per chip denomination. Mints on deposit, burns on withdrawal, and is what tables escrow during a round." },
  { name: "TableManager / RouletteGame", role: "Opens public and private tables, accepts wagers only after a risk check, runs rounds, and records settlements as claimable balances." },
  { name: "RewardVault", role: "Holds reward inventory (crypto and supported Stock Tokens) and settles claims by pull. Can only offer what it actually holds." },
  { name: "RandomnessManager", role: "Stores the server commitment before bets open and verifies the reveal that produces the round result." },
  { name: "RiskEngine", role: "Pure arithmetic: available bankroll, round exposure cap and the maximum stake for a given payout multiplier. Called before every wager." },
  { name: "AccessController", role: "Role registry for privileged calls (parameter updates, pausing, inventory management). Intended to be owned by a multisig." },
  { name: "EmergencyPause", role: "Independent switches for deposits, gameplay, claims and withdrawals so one concern can be frozen without freezing the rest." },
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 grid gap-6 py-16 md:grid-cols-[200px_minmax(0,1fr)] md:gap-16" aria-labelledby={`${id}-h`}>
      <div className="md:sticky md:top-28 md:self-start">
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <div className="min-w-0 max-w-3xl">
        <h2 id={`${id}-h`} className="font-display text-display-sm text-balance">
          {title}
        </h2>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
      </div>
    </section>
  );
}

const cap = economicsDefaults.maxRoundExposureBps / 100;
const safety = economicsDefaults.safetyReserveBps / 100;

export default function TechnologyPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Technology</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Public chain. Small contracts. One invariant.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          How {siteConfig.name} is built: the chain it runs on, what a chip is, which contracts do what, how a result is produced and why the
          treasury cannot accept a bet it cannot pay.
        </p>
      </div>

      <nav aria-label="Sections" className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted hairline-b pb-6">
        {[
          ["chain", "Robinhood Chain"],
          ["chips", "Chips"],
          ["contracts", "Contracts"],
          ["architecture", "Architecture"],
          ["fairness", "Fairness"],
          ["vault", "Reward vault"],
          ["solvency", "Solvency engine"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="transition-colors hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="divide-y divide-hairline">
        <Section id="chain" eyebrow="Network" title="Robinhood Chain.">
          <p>
            {siteConfig.name} runs on Robinhood Chain, an Ethereum-compatible network. We use it as public infrastructure; {siteConfig.name} is an
            independent product and is not operated, endorsed or sponsored by Robinhood.
          </p>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border text-[14px] sm:grid-cols-2">
            {[
              ["Mainnet chain id", String(robinhoodChain.id)],
              ["Testnet chain id", String(robinhoodChainTestnet.id)],
              ["Gas asset", "ETH"],
              ["Explorer", robinhoodChain.blockExplorers.default.url.replace("https://", "")],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface p-5 dark:bg-elevated">
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="mt-1 font-mono text-[13.5px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            Every contract address, transaction and token balance is visible at{" "}
            <a href={robinhoodChain.blockExplorers.default.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
              {robinhoodChain.blockExplorers.default.url.replace("https://", "")}
            </a>
            . The interface currently targets the <strong>{siteConfig.chainEnv}</strong> environment.
          </p>
        </Section>

        <Section id="chips" eyebrow="Chips" title="Chips are ERC-1155 tokens in your wallet.">
          <p>
            A chip is a semi-fungible token: one token id per denomination (1, 5, 10, 25, 50 and 100), with balances that you hold in your own
            wallet. Depositing mints chips; withdrawing burns them. During a round the table escrows the chips you have staked and releases or
            settles them when the result is revealed.
          </p>
          <p>
            Chips are game pieces. They carry no yield, no governance and no claim on the protocol. Practice chips are a separate, browser-only
            concept with no token behind them.
          </p>
        </Section>

        <Section id="contracts" eyebrow="Contracts" title="Eight small contracts, each with one job.">
          <div className="flex items-center gap-3">
            <Badge tone="amber">In development</Badge>
            <span className="text-[13px]">Roles described below; none are deployed to mainnet and none have been audited.</span>
          </div>
          <ul className="divide-y divide-hairline hairline-t hairline-b">
            {contracts.map((c) => (
              <li key={c.name} className="grid gap-1 py-4 md:grid-cols-[240px_1fr] md:gap-8">
                <span className="font-mono text-[13px] text-ink">{c.name}</span>
                <span className="text-[14px] leading-relaxed">{c.role}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="architecture" eyebrow="Architecture" title="How the pieces connect.">
          <ArchitectureDiagram />
          <p>
            Value only ever enters through <strong>CasinoTreasury</strong> and only ever leaves through a pull from the treasury or the{" "}
            <strong>RewardVault</strong>. Game logic cannot move funds directly; it can only record what is owed.
          </p>
        </Section>

        <Section id="fairness" eyebrow="Fairness" title="Commit before, reveal after, verify anytime.">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Before bets open the server publishes <code className="font-mono text-[13px] text-ink">keccak256(serverSeed)</code>: a commitment it cannot change.</li>
            <li>You contribute a player seed. The server cannot predict it when it commits.</li>
            <li>When the round closes a block reference is fixed and the seed is revealed.</li>
          </ol>
          <pre className="overflow-x-auto rounded-2xl border border-border bg-surface p-5 font-mono text-[12.5px] leading-relaxed text-ink dark:bg-elevated">
{`result = keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ roundId) mod 37`}
          </pre>
          <p>
            Anyone can recompute the hash, check it against the commitment and confirm the pocket. The same derivation is used by the practice
            engine, the tests and the intended RandomnessManager contract. Each round uses fresh seeds; outcomes are independent and no number is
            ever more or less likely because of what came before.
          </p>
        </Section>

        <Section id="vault" eyebrow="Reward vault" title="Rewards come from inventory, not promises.">
          <p>
            A share of every deposit (by default {economicsDefaults.rewardInventoryBps / 100}%) is routed to reward inventory. The RewardVault holds
            that inventory as actual assets: crypto, and supported Stock Tokens where available. A claim can be settled in an asset only when the
            vault holds enough of it; otherwise that option is simply not shown.
          </p>
          <p>
            Winnings are recorded as claimable balances and are withdrawn by the player, never pushed. Stock Token settlement is additionally gated
            by jurisdiction; see the{" "}
            <a href="/stock-token-disclosure" className="text-ink underline underline-offset-2">Stock Token disclosure</a>.
          </p>
        </Section>

        <Section id="solvency" eyebrow="Solvency engine" title="Every wager is limited by available collateral before acceptance.">
          <p>The risk engine computes two numbers before accepting any bet, from a live snapshot of the treasury:</p>
          <pre className="overflow-x-auto rounded-2xl border border-border bg-surface p-5 font-mono text-[12.5px] leading-relaxed text-ink dark:bg-elevated">
{`availableBankroll = bankroll − reserved − claimable − protocolReserve − safetyReserve
maxStake          = availableBankroll × exposureCap ÷ payoutMultiplier

accept iff  maximumLiabilityAfterBet ≤ availableBankroll × exposureCap`}
          </pre>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>reserved</strong>: worst-case liability of rounds already in flight.</li>
            <li><strong>claimable</strong>: wins recorded but not yet pulled by players.</li>
            <li><strong>protocolReserve</strong>: operating reserve, never used for payouts.</li>
            <li><strong>safetyReserve</strong>: {safety}% of bankroll by default, never exposed to any round.</li>
            <li><strong>exposureCap</strong>: {cap}% by default; no single round may risk more of what remains.</li>
          </ul>
          <p>
            Dividing by the payout multiplier is what makes limits honest: a 35:1 straight-up bet gets a much smaller cap than an even-money bet
            because the treasury would owe much more if it won. If available bankroll drops below {economicsDefaults.minBankrollToOpen} USD-equivalent,
            tables do not open. Defaults are adjustable within published bounds and shown on the Treasury page.
          </p>
          <div className="pt-2">
            <Button href="/how-it-works#limits" variant="outline">Table limits, in plain words</Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
