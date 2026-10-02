import type { Metadata } from "next";
import { LegalPage, LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Privacy Policy", description: "Draft policy describing what the interface collects and why." };

const sections = [
  { id: "controller", label: "1. Who is responsible" },
  { id: "collect", label: "2. What we collect" },
  { id: "use", label: "3. How we use it" },
  { id: "onchain", label: "4. Onchain data" },
  { id: "sharing", label: "5. Sharing" },
  { id: "retention", label: "6. Retention" },
  { id: "rights", label: "7. Your rights" },
  { id: "security", label: "8. Security" },
  { id: "children", label: "9. Children" },
  { id: "changes", label: "10. Changes" },
  { id: "contact", label: "11. Contact" },
];

export default function PrivacyPage() {
  const name = siteConfig.name;
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" lede={`What ${name} collects, why, and what you can do about it.`} sections={sections}>
      <h2 id="controller">1. Who is responsible</h2>
      <LegalPlaceholder>Data controller identity, registered address, representative (where required) and data-protection contact.</LegalPlaceholder>

      <h2 id="collect">2. What we collect</h2>
      <h3>Wallet and activity data</h3>
      <p>
        When you connect a wallet we see your public address and the chain you are on. When you play, the Interface reads public Protocol events
        (deposits, wagers, results, claims) associated with that address.
      </p>
      <h3>Technical data</h3>
      <p>Standard server logs: IP address, user agent, timestamps and the pages requested. These are needed to run the service and defend it.</p>
      <h3>Preferences stored in your browser</h3>
      <p>
        Theme, sound and motion preferences, responsible-play settings, the age-gate confirmation and practice-mode state are stored locally in
        your browser. They are not transmitted to us unless a later version adds wallet-linked enforcement, which will be disclosed here first.
      </p>
      <h3>Jurisdiction signals</h3>
      <LegalPlaceholder>Describe the method of jurisdiction determination (self-declaration, IP geolocation, other) and the data it relies on, once decided with counsel.</LegalPlaceholder>

      <h2 id="use">3. How we use it</h2>
      <ul>
        <li>To display your chips, rounds and claims and to compose the transactions you ask for.</li>
        <li>To enforce eligibility, age and jurisdiction rules and your own responsible-play limits.</li>
        <li>To keep the service secure, detect abuse and investigate incidents.</li>
        <li>To meet legal obligations, including those described in the <a href="/aml">AML &amp; Sanctions Policy</a>.</li>
      </ul>
      <p>We do not sell personal data and we do not use it for third-party advertising.</p>
      <LegalPlaceholder>Legal bases for each purpose where the governing law requires them to be stated.</LegalPlaceholder>

      <h2 id="onchain">4. Onchain data</h2>
      <p>
        Transactions on Robinhood Chain are public and permanent. Your address, deposits, wagers, results and claims are visible to anyone using a
        block explorer and cannot be deleted by us or by you. Please consider this before connecting a wallet you use for other purposes.
      </p>

      <h2 id="sharing">5. Sharing</h2>
      <ul>
        <li>Infrastructure providers that host the Interface and relay RPC requests, under contract and only as needed to run the service.</li>
        <li>Authorities where we are legally required to disclose, or to establish or defend legal claims.</li>
        <li>A successor in the event of a reorganisation, with notice to you.</li>
      </ul>
      <LegalPlaceholder>Named categories of processors, international transfer mechanisms and any regulator-mandated disclosures.</LegalPlaceholder>

      <h2 id="retention">6. Retention</h2>
      <p>Server logs are kept for a limited period for security purposes and then deleted or anonymised. Browser-stored preferences remain until you clear them.</p>
      <LegalPlaceholder>Specific retention periods, including any statutory minimums under AML or gambling regulation.</LegalPlaceholder>

      <h2 id="rights">7. Your rights</h2>
      <p>Depending on where you live you may have the right to access, correct, delete or export personal data we hold, to object to or restrict processing, and to complain to a supervisory authority.</p>
      <LegalPlaceholder>Jurisdiction-specific rights, response timelines, verification procedure and the competent supervisory authority.</LegalPlaceholder>

      <h2 id="security">8. Security</h2>
      <p>
        We never hold your private keys. We apply access controls and encryption in transit to the Interface and its logs. No system is perfectly
        secure; see the <a href="/security">Security page</a> for current status and how to report a vulnerability.
      </p>

      <h2 id="children">9. Children</h2>
      <p>Real-money features are not directed at anyone under 18 (or the higher applicable age) and we do not knowingly collect their data. If you believe a minor has used the service, contact us.</p>

      <h2 id="changes">10. Changes</h2>
      <p>We will post updates here and, for material changes, notify you in the Interface before they take effect.</p>

      <h2 id="contact">11. Contact</h2>
      <LegalPlaceholder>Privacy contact address and data-protection officer details, where applicable.</LegalPlaceholder>
    </LegalPage>
  );
}
