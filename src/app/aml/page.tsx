import type { Metadata } from "next";
import { LegalPage, LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "AML & Sanctions Policy", description: "Draft anti-money-laundering and sanctions policy." };

const sections = [
  { id: "statement", label: "1. Statement" },
  { id: "scope", label: "2. Scope" },
  { id: "screening", label: "3. Screening" },
  { id: "verification", label: "4. Verification" },
  { id: "monitoring", label: "5. Monitoring" },
  { id: "action", label: "6. Action we may take" },
  { id: "reporting", label: "7. Reporting" },
  { id: "records", label: "8. Records" },
  { id: "contact", label: "9. Contact" },
];

export default function AmlPage() {
  return (
    <LegalPage eyebrow="Legal" title="AML & Sanctions Policy" lede={`How ${siteConfig.name} intends to prevent its use for money laundering, terrorist financing and sanctions evasion.`} sections={sections}>
      <h2 id="statement">1. Statement</h2>
      <p>
        We do not want the Protocol used to launder money, finance terrorism or evade sanctions, and we will cooperate with lawful requests from
        competent authorities. This policy describes the controls we intend to apply once real-money play is enabled anywhere. Until then, no
        real-money activity is offered.
      </p>
      <LegalPlaceholder>Statement of the regulatory framework that applies to the operating entity, the designated compliance officer and the approving body.</LegalPlaceholder>

      <h2 id="scope">2. Scope</h2>
      <p>This policy applies to deposits, withdrawals, claims and settlement in any asset, and to every wallet address that interacts with real-money features through the Interface. Practice mode, which involves no value, is out of scope.</p>

      <h2 id="screening">3. Screening</h2>
      <p>
        Before a wallet can deposit or claim, we intend to screen its address against sanctions lists and known illicit-activity indicators, and to
        decline service to addresses that match. Screening may be repeated at any time.
      </p>
      <LegalPlaceholder>Named screening lists, screening provider, match-handling procedure and false-positive resolution process.</LegalPlaceholder>

      <h2 id="verification">4. Verification</h2>
      <p>Where required by law or by risk, we may require identity and source-of-funds information before allowing deposits above a threshold, before a withdrawal or claim, or at any time thereafter.</p>
      <LegalPlaceholder>Verification thresholds, acceptable documents, enhanced-due-diligence triggers and the verification provider, per jurisdiction.</LegalPlaceholder>

      <h2 id="monitoring">5. Monitoring</h2>
      <p>
        Because the Protocol is onchain, deposits, wagers and claims are publicly observable. We intend to monitor for patterns inconsistent with
        ordinary play, such as rapid deposit-and-withdraw cycles with minimal wagering, structuring around thresholds, or interaction with flagged addresses.
      </p>

      <h2 id="action">6. Action we may take</h2>
      <ul>
        <li>Decline a deposit, wager, claim or settlement.</li>
        <li>Request information and suspend real-money features until it is provided.</li>
        <li>Pause claims or withdrawals for an address while a review is conducted, without reassigning any balance.</li>
        <li>Terminate access and report to authorities where required.</li>
      </ul>
      <p>The Protocol does not allow us to take a player&rsquo;s balance; a balance frozen for review remains recorded against the address.</p>

      <h2 id="reporting">7. Reporting</h2>
      <LegalPlaceholder>Suspicious-activity reporting obligations, the authority to which reports are made, timelines and tipping-off restrictions.</LegalPlaceholder>

      <h2 id="records">8. Records</h2>
      <LegalPlaceholder>Record-keeping requirements and retention periods for screening results, verification documents and transaction records.</LegalPlaceholder>

      <h2 id="contact">9. Contact</h2>
      <LegalPlaceholder>Compliance contact details for law-enforcement and regulator enquiries.</LegalPlaceholder>
    </LegalPage>
  );
}
