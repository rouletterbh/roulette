import type { Metadata } from "next";
import { LegalPage, LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Risk Disclosure", description: "Draft disclosure of the risks of onchain roulette play." };

const sections = [
  { id: "edge", label: "1. The house edge" },
  { id: "independence", label: "2. Independence of outcomes" },
  { id: "software", label: "3. Software risk" },
  { id: "network", label: "4. Network and key risk" },
  { id: "market", label: "5. Market risk on rewards" },
  { id: "availability", label: "6. Availability of rewards" },
  { id: "jurisdiction", label: "7. Jurisdictional risk" },
  { id: "control", label: "8. Loss of control" },
  { id: "advice", label: "9. No advice" },
];

export default function RiskDisclosurePage() {
  return (
    <LegalPage eyebrow="Legal" title="Risk Disclosure" lede="Read this before you deposit. It is short on purpose." sections={sections}>
      <h2 id="edge">1. The house edge</h2>
      <p>
        Single-zero roulette pays 35:1 on a single number that occurs 1 in 37 times. Across all bet types the expected return to players is about
        97.3%; the remaining 2.7% is the house edge. Over many rounds, players as a whole lose. Treat any money you bring to the table as the price
        of entertainment, not as an investment.
      </p>

      <h2 id="independence">2. Independence of outcomes</h2>
      <p>
        Every round uses fresh seeds and is independent of every other. A run of reds does not make black more likely; a losing streak does not make
        a win &ldquo;due&rdquo;. Any strategy that depends on past results, including doubling after losses, does not change the expected outcome and
        can exhaust a bankroll quickly.
      </p>

      <h2 id="software">3. Software risk</h2>
      <p>
        The Protocol contracts are in development and have <strong>not been audited</strong>. The Interface may contain defects. A bug could cause
        loss of chips or claimable balances that we may be unable to reverse. Do not deposit more than you are prepared to lose to a software failure.
      </p>

      <h2 id="network">4. Network and key risk</h2>
      <ul>
        <li>Robinhood Chain is a public network we do not control. It may become congested, halt or reorganise.</li>
        <li>You hold your own keys. If you lose them, or sign a malicious transaction elsewhere, your chips and claims are gone and we cannot restore them.</li>
        <li>Gas is paid in ETH; its price can change the cost of playing.</li>
      </ul>

      <h2 id="market">5. Market risk on rewards</h2>
      <p>
        If you choose to settle a win in crypto or in a supported Stock Token, the value of that asset can fall, including to zero, after settlement.
        Stock Tokens are blockchain-based instruments whose value may not track any reference asset at all times. See the{" "}
        <a href="/stock-token-disclosure">Stock Token Disclosure</a>.
      </p>

      <h2 id="availability">6. Availability of rewards</h2>
      <p>
        Settlement in a given asset is offered only when the reward vault actually holds it and your jurisdiction is enabled. A reward you saw
        yesterday may be unavailable today. Your claimable balance remains owed to you regardless; only the settlement options change.
      </p>

      <h2 id="jurisdiction">7. Jurisdictional risk</h2>
      <p>
        Real-money play is not offered in any jurisdiction until counsel confirms it. Laws change. If your region becomes restricted, new wagers
        will stop but existing balances remain claimable. You are responsible for knowing whether participation is lawful where you are.
      </p>
      <LegalPlaceholder>Jurisdiction-specific risk warnings mandated by local gambling or financial-promotion rules, including prescribed wording and formatting.</LegalPlaceholder>

      <h2 id="control">8. Loss of control</h2>
      <p>
        Gambling can become harmful. Set limits before you play using the <a href="/responsible-play">Responsible Play</a> controls, and stop if it
        stops being enjoyable. Support is available; see that page.
      </p>

      <h2 id="advice">9. No advice</h2>
      <p>
        Nothing in {siteConfig.name} is financial, investment, legal or tax advice. We do not recommend any asset, including those offered as reward
        settlement options. Any tax consequences of winnings or asset settlement are yours to determine.
      </p>
    </LegalPage>
  );
}
