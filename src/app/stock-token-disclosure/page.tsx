import type { Metadata } from "next";
import { LegalPage, LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Stock Token Disclosure", description: "What Stock Tokens are and are not, and when reward settlement in them is possible." };

const sections = [
  { id: "what", label: "1. What Stock Tokens are" },
  { id: "not", label: "2. What they are not" },
  { id: "availability", label: "3. Availability" },
  { id: "settlement", label: "4. Reward settlement" },
  { id: "issuer", label: "5. Issuer documentation" },
  { id: "risks", label: "6. Risks" },
  { id: "advice", label: "7. No advice or endorsement" },
];

export default function StockTokenDisclosurePage() {
  const name = siteConfig.name;
  return (
    <LegalPage eyebrow="Legal" title="Stock Token Disclosure" lede="Plain language on an asset class that is easy to misdescribe." sections={sections}>
      <h2 id="what">1. What Stock Tokens are</h2>
      <p>
        Stock Tokens are blockchain-based instruments issued by a third party on Robinhood Chain. Each is designed to reference the price of a
        particular listed company. {name} may, where enabled, offer Stock Tokens as one way to settle a reward you have already won. {name} does not
        issue Stock Tokens and has no role in how they are structured, priced or redeemed.
      </p>

      <h2 id="not">2. What they are not</h2>
      <ul>
        <li>Stock Tokens are <strong>not</strong> shares of the referenced company and do not represent direct ownership of them.</li>
        <li>Holding a Stock Token does <strong>not</strong> give you voting rights, shareholder rights or a direct claim on the company.</li>
        <li>Any dividend or corporate-action treatment is determined by the issuer&rsquo;s terms, not by the company and not by {name}.</li>
        <li>A Stock Token&rsquo;s market price may differ from the price of the referenced stock, including during market closures.</li>
      </ul>
      <p>We will never describe Stock Tokens as &ldquo;shares&rdquo;, &ldquo;equities&rdquo; or &ldquo;tokenized stock&rdquo;. If you see that language anywhere in the Interface, it is an error; please report it.</p>

      <h2 id="availability">3. Availability</h2>
      <p>
        Whether you may hold or receive Stock Tokens depends on where you live and on the issuer&rsquo;s own eligibility rules. Availability is
        jurisdiction-dependent. Nothing on this site should be read as implying Stock Tokens are available in any particular country, including the
        United States.
      </p>
      <LegalPlaceholder>Per-jurisdiction statement of whether Stock Token settlement may be offered, and any required eligibility, suitability or disclosure language.</LegalPlaceholder>

      <h2 id="settlement">4. Reward settlement</h2>
      <p>Settlement of a reward in a Stock Token happens only when all of the following are true at the moment you claim:</p>
      <ol>
        <li>The reward vault actually holds enough of that specific Stock Token to cover your claim. Inventory is purchased in advance; we never promise an asset we have not bought.</li>
        <li>Your jurisdiction is enabled for Stock Token settlement under the <a href="/restricted-jurisdictions">jurisdiction gate</a>.</li>
        <li>The token&rsquo;s contract address has been verified and published in our reward registry. Unverified entries are shown as placeholders and are not claimable.</li>
      </ol>
      <p>If any condition fails, that settlement option is simply not shown. Your claimable balance remains owed to you and can be settled in another available asset.</p>

      <h2 id="issuer">5. Issuer documentation</h2>
      <p>Before accepting any Stock Token you should read the issuer&rsquo;s own terms, prospectus or product documentation, which govern the instrument.</p>
      <LegalPlaceholder>Link to the authoritative issuer documentation for each supported Stock Token, to be inserted once verified. No link is provided in this draft to avoid citing an unverified source.</LegalPlaceholder>

      <h2 id="risks">6. Risks</h2>
      <ul>
        <li>Price risk: the token may lose value, including after you receive it.</li>
        <li>Tracking risk: the token may trade away from the referenced stock&rsquo;s price.</li>
        <li>Issuer risk: your rights depend on the issuer&rsquo;s solvency and terms.</li>
        <li>Liquidity risk: you may be unable to sell when you want to, at the price you expect.</li>
        <li>Regulatory risk: treatment of Stock Tokens may change in your jurisdiction.</li>
      </ul>

      <h2 id="advice">7. No advice or endorsement</h2>
      <p>
        {name} is an independent product. It is not operated, endorsed or sponsored by Robinhood, by any Stock Token issuer or by any referenced
        company. Offering a Stock Token as a settlement option is not a recommendation to hold it. Nothing here is investment, legal or tax advice.
      </p>
    </LegalPage>
  );
}
