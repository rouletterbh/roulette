import type { Metadata } from "next";
import { LegalPage, LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Cookie Notice", description: "Draft notice on the browser storage the interface uses." };

const sections = [
  { id: "summary", label: "1. In short" },
  { id: "storage", label: "2. What is stored" },
  { id: "analytics", label: "3. Analytics and third parties" },
  { id: "manage", label: "4. Managing storage" },
  { id: "changes", label: "5. Changes" },
];

const storage = [
  { key: "theme", purpose: "Remembers light or dark mode.", kind: "Preference" },
  { key: "preferences", purpose: "Sound, reduced-motion and reminder preferences.", kind: "Preference" },
  { key: "responsible-play", purpose: "Your limits, cooldowns, self-exclusion and account lock.", kind: "Protection" },
  { key: "responsible-play:session, responsible-play:playtime", purpose: "Session clock and today's play time for reminders and daily limits.", kind: "Protection" },
  { key: "age-gate", purpose: "That you confirmed your age and accepted the current Terms.", kind: "Compliance" },
  { key: "chips-demo, wallet-demo, profile-local, created-tables", purpose: "Practice and demo state that never touches the chain.", kind: "Functional" },
];

export default function CookiesPage() {
  return (
    <LegalPage eyebrow="Legal" title="Cookie Notice" lede={`${siteConfig.name} uses a small amount of browser storage and no advertising trackers.`} sections={sections}>
      <h2 id="summary">1. In short</h2>
      <p>
        The Interface stores a handful of values in your browser so it can remember your preferences and enforce the limits you set. None of them
        are used for advertising or cross-site tracking. Most are &ldquo;local storage&rdquo; rather than cookies; this notice covers both.
      </p>

      <h2 id="storage">2. What is stored</h2>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Purpose</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {storage.map((s) => (
            <tr key={s.key}>
              <td className="font-mono text-[12.5px]">{s.key}</td>
              <td>{s.purpose}</td>
              <td>{s.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Wallet software you connect may store its own data under its own policy.</p>

      <h2 id="analytics">3. Analytics and third parties</h2>
      <p>At the time of this draft the Interface sets no analytics or advertising cookies. If that changes, this notice will list each provider, its purpose and how to opt out before it goes live.</p>
      <LegalPlaceholder>Consent mechanism and banner requirements for jurisdictions that mandate prior consent for non-essential storage.</LegalPlaceholder>

      <h2 id="manage">4. Managing storage</h2>
      <p>
        You can clear site data for the Interface in your browser settings at any time. Doing so will reset your preferences and, importantly, any
        responsible-play limits, cooldowns or self-exclusion stored locally. Until wallet-linked enforcement ships, clearing storage removes those protections.
      </p>

      <h2 id="changes">5. Changes</h2>
      <p>We will update this notice whenever the set of stored values changes.</p>
    </LegalPage>
  );
}
