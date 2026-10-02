import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Security",
  description: "Contract status, ownership, pause mechanisms, withdrawal protections, audit status, responsible disclosure and what admins can never do.",
};

const pauses = [
  { scope: "Deposits", effect: "New deposits and chip minting stop. Existing chips, play and claims are unaffected." },
  { scope: "Gameplay", effect: "No new rounds open and no new wagers are accepted. In-flight rounds still settle; claims and withdrawals continue." },
  { scope: "Claims", effect: "Recording of new claimable balances pauses. Balances already recorded stay owed and can still be withdrawn." },
  { scope: "Withdrawals", effect: "Pulls from the treasury and reward vault pause. Nothing is moved or re-assigned; balances remain the player's." },
];

const never = [
  "Alter the outcome of a completed round. Results are derived from a commitment published before bets opened.",
  "Rewrite history. Rounds, wagers and settlements are events on a public chain, not rows we control.",
  "Take player escrow. Chips staked in a round can only be released to the player or settled by the round's own result.",
  "Change a submitted wager. Once accepted, a wager's amount and position are fixed in the round record.",
  "Mint chips without a deposit, or burn a player's chips without a withdrawal from that player.",
  "Move a claimable balance to another address. Claims are pulled by the address that earned them.",
];

function Block({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
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

export default function SecurityPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Security</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">What is protected, what is paused, and what we cannot do.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          A plain account of where {siteConfig.name} stands today. Where something is planned rather than done, it says so.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Badge tone="amber">Not yet audited</Badge>
          <Badge tone="outline">Contracts in development</Badge>
          <Badge tone="outline">Multisig planned</Badge>
        </div>
      </div>

      <div className="mt-8 divide-y divide-hairline hairline-t">
        <Block id="contracts" eyebrow="Smart contracts" title="A small, separable contract set.">
          <p>
            The protocol is split into single-purpose contracts: treasury, chips, tables, rewards, randomness, risk, access and pause. Each one is
            small enough to read in a sitting, and funds only ever enter through the treasury and leave through a player pull. The full list and
            their roles are on the <a href="/technology#contracts" className="text-ink underline underline-offset-2">Technology page</a>.
          </p>
          <p>
            <strong>Status:</strong> in development. No contract is deployed to Robinhood Chain mainnet. Addresses will be published here and on the
            explorer when they are.
          </p>
        </Block>

        <Block id="ownership" eyebrow="Ownership" title="Privileged roles behind a multisig.">
          <p>
            Every privileged call (changing economic parameters within their published bounds, managing reward inventory, pausing) is gated by{" "}
            <strong>AccessController</strong>. The intended owner of those roles is a multisignature wallet with a time delay for parameter
            changes, so that no single key can act alone or act instantly.
          </p>
          <p>
            <strong>Status:</strong> planned. Until the multisig is configured and published, assume administrative keys are held by the development team.
          </p>
        </Block>

        <Block id="pause" eyebrow="Pause mechanisms" title="Four switches, not one.">
          <p>
            <strong>EmergencyPause</strong> exposes independent switches so that one concern can be frozen without freezing the rest. Pausing is
            always reversible and never moves funds.
          </p>
          <ul className="divide-y divide-hairline hairline-t hairline-b">
            {pauses.map((p) => (
              <li key={p.scope} className="grid gap-1 py-4 md:grid-cols-[160px_1fr] md:gap-8">
                <span className="font-medium text-ink">{p.scope}</span>
                <span className="text-[14px]">{p.effect}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block id="withdrawals" eyebrow="Withdrawal protections" title="Pull, never push.">
          <p>
            Winnings and withdrawals are recorded as balances owed to an address and are withdrawn by that address. The protocol never initiates
            a transfer to a player. This removes an entire class of reentrancy and griefing problems and means a paused withdrawal is a delay,
            not a loss: the balance remains recorded against you.
          </p>
          <p>
            Before any wager is accepted the risk engine confirms the treasury can cover it in full, so a claimable balance is always backed by
            collateral that was reserved at the moment the bet was taken.
          </p>
        </Block>

        <Block id="audits" eyebrow="Audits" title="Not yet audited.">
          <div className="flex items-center gap-3">
            <Badge tone="amber">Not yet audited</Badge>
            <span className="text-[13px]">No third-party review of any contract has been completed or commissioned.</span>
          </div>
          <p>
            We will not describe the protocol as audited until an independent review has been completed and its report is linked from this page in
            full, including unresolved findings. Until then, treat the contracts as unreviewed software.
          </p>
        </Block>

        <Block id="disclosure" eyebrow="Responsible disclosure" title="Found something? Tell us first.">
          <p>
            If you believe you have found a vulnerability, please report it privately and give us reasonable time to respond before publishing.
            We will acknowledge receipt, keep you informed and credit you if you wish.
          </p>
          <div className="rounded-2xl border border-dashed border-border-strong px-5 py-4 font-mono text-[13.5px] text-ink">
            security@<span className="text-muted">[placeholder domain]</span>
            <span className="ml-3 font-sans text-[12px] text-muted">address to be confirmed before launch</span>
          </div>
          <p className="text-[13.5px]">
            Please do not test against mainnet funds or other players. A testnet deployment and scope will be published alongside the contract addresses.
          </p>
        </Block>

        <Block id="never" eyebrow="Limits of control" title="What admins can never do.">
          <p>Regardless of who holds the privileged roles, the contracts are designed so that no administrator can:</p>
          <ol className="divide-y divide-hairline hairline-t hairline-b">
            {never.map((n, i) => (
              <li key={n} className="grid gap-3 py-4 md:grid-cols-[48px_1fr]">
                <span className="font-display text-2xl text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[14.5px] text-ink-2">{n}</span>
              </li>
            ))}
          </ol>
          <p className="text-[13.5px]">
            Administrators <em>can</em> pause the switches above, adjust economic parameters inside their published bounds, and add or remove
            reward inventory. Those actions are visible onchain.
          </p>
          <div className="pt-2">
            <Button href="/technology" variant="outline">Read the technology overview</Button>
          </div>
        </Block>
      </div>
    </div>
  );
}
