import type { Metadata } from "next";
import { LegalPage, LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Terms of Service", description: "Draft terms governing use of the interface and the protocol." };

const sections = [
  { id: "operator", label: "1. Who we are" },
  { id: "eligibility", label: "2. Eligibility" },
  { id: "service", label: "3. The service" },
  { id: "chips", label: "4. Chips" },
  { id: "play", label: "5. Play and wagers" },
  { id: "fairness", label: "6. Fairness" },
  { id: "rewards", label: "7. Rewards and claims" },
  { id: "fees", label: "8. Fees" },
  { id: "responsible", label: "9. Responsible play" },
  { id: "conduct", label: "10. Prohibited conduct" },
  { id: "risk", label: "11. Risk" },
  { id: "liability", label: "12. Warranties and liability" },
  { id: "changes", label: "13. Changes and suspension" },
  { id: "law", label: "14. Governing law" },
  { id: "contact", label: "15. Contact" },
];

export default function TermsPage() {
  const name = siteConfig.name;
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" lede={`The agreement between you and the operator of ${name}.`} sections={sections}>
      <h2 id="operator">1. Who we are</h2>
      <p>
        {name} (the &ldquo;Interface&rdquo;) is a web application for interacting with a set of smart contracts on Robinhood Chain (the
        &ldquo;Protocol&rdquo;). {name} is an independent product. It is not operated, endorsed or sponsored by Robinhood or any affiliate of Robinhood.
      </p>
      <LegalPlaceholder>Legal entity name, registration number, registered address and the capacity in which it operates the Interface.</LegalPlaceholder>

      <h2 id="eligibility">2. Eligibility</h2>
      <p>You may use real-money features only if all of the following are true:</p>
      <ul>
        <li>You are at least 18 years old, or the higher minimum age that applies where you live.</li>
        <li>Real-money play is enabled for your jurisdiction under our <a href="/restricted-jurisdictions">jurisdiction gate</a>. At the time of this draft, no jurisdiction is enabled.</li>
        <li>You are not subject to self-exclusion, an account lock or a cooldown you have set.</li>
        <li>You are not a person with whom we are prohibited from dealing under applicable sanctions.</li>
      </ul>
      <p>Practice mode involves no money and no rewards and may be used without meeting the above.</p>
      <LegalPlaceholder>Jurisdiction-specific eligibility language, including minimum age and any residency or identity-verification requirements.</LegalPlaceholder>

      <h2 id="service">3. The service</h2>
      <p>
        The Interface displays Protocol state and helps you compose transactions that you sign with your own wallet. We do not hold your keys, cannot
        reverse your transactions and cannot access assets in your wallet. The Protocol runs on a public network we do not control.
      </p>
      <p>The Interface and the Protocol are provided as software in development. See section 12.</p>

      <h2 id="chips">4. Chips</h2>
      <p>
        Chips are ERC-1155 tokens minted to your wallet when you deposit and burned when you withdraw. They are game pieces for use within the
        Protocol. They carry no interest, dividend, governance right or claim on us. Practice chips exist only in your browser and have no value.
      </p>

      <h2 id="play">5. Play and wagers</h2>
      <ul>
        <li>A wager is accepted only after the Protocol confirms the treasury can cover its maximum payout. A wager that fails this check is declined and no chips are taken.</li>
        <li>Once accepted, a wager cannot be changed or withdrawn by you or by us.</li>
        <li>Chips staked in a round are held in escrow by the Protocol until the round settles.</li>
        <li>Payouts follow the published odds for single-zero roulette.</li>
      </ul>

      <h2 id="fairness">6. Fairness</h2>
      <p>
        Outcomes are produced by commit–reveal: a commitment to the server seed is published before bets open, you contribute a player seed, and
        the result is derived from both together with a block reference and round id. You can verify any round yourself. Every round is independent
        of every other.
      </p>

      <h2 id="rewards">7. Rewards and claims</h2>
      <ul>
        <li>Wins are recorded as balances claimable by the address that earned them. Claims are withdrawn by you; we do not push funds.</li>
        <li>Settlement in a particular asset (crypto or supported Stock Tokens) is offered only when the reward vault holds sufficient inventory of that asset and your jurisdiction is enabled for it.</li>
        <li>We make no promise that any particular asset will be available at any time. See the <a href="/stock-token-disclosure">Stock Token Disclosure</a>.</li>
      </ul>

      <h2 id="fees">8. Fees</h2>
      <p>
        Deposits are split according to the published economics configuration, which includes a platform fee within a published bound. Network
        gas fees are paid by you to the network and are not received by us. Current values are shown on the Treasury page.
      </p>

      <h2 id="responsible">9. Responsible play</h2>
      <p>
        You can set session reminders, cooldowns, self-exclusion periods, deposit and loss limits, a daily time limit and an account lock on the{" "}
        <a href="/responsible-play">Responsible Play</a> page. Controls that tighten play apply immediately; controls that loosen it apply after a delay.
        We may also restrict your access where we reasonably believe it is necessary to protect you or comply with law.
      </p>

      <h2 id="conduct">10. Prohibited conduct</h2>
      <ul>
        <li>Using the Interface from a jurisdiction where real-money play is not enabled, or circumventing the jurisdiction or age gate.</li>
        <li>Attacking, probing or exploiting the Interface, the Protocol or other players, except within a published responsible-disclosure scope.</li>
        <li>Using funds derived from unlawful activity, or acting on behalf of someone who is not eligible.</li>
        <li>Automating play in a way that degrades the service for others.</li>
      </ul>

      <h2 id="risk">11. Risk</h2>
      <p>
        Roulette has a house edge: over time players as a whole lose. Software may contain defects; the contracts are not yet audited. Networks may
        halt and assets may lose value. Read the <a href="/risk-disclosure">Risk Disclosure</a> before depositing.
      </p>

      <h2 id="liability">12. Warranties and liability</h2>
      <p>The Interface and the Protocol are provided &ldquo;as is&rdquo;, without warranty of any kind, to the fullest extent permitted by law.</p>
      <LegalPlaceholder>Limitation of liability, indemnity and consumer-protection carve-outs as required by the governing jurisdiction.</LegalPlaceholder>

      <h2 id="changes">13. Changes and suspension</h2>
      <p>
        We may update these Terms; material changes will be announced on the Interface and you will be asked to accept them again before real-money
        use. We may pause deposits, gameplay, claims or withdrawals independently in an emergency. A pause never reassigns or removes a balance owed to you.
      </p>

      <h2 id="law">14. Governing law</h2>
      <LegalPlaceholder>Governing law, venue, dispute-resolution mechanism and any mandatory local-law provisions.</LegalPlaceholder>

      <h2 id="contact">15. Contact</h2>
      <LegalPlaceholder>Support and legal contact details for the operating entity.</LegalPlaceholder>
    </LegalPage>
  );
}
