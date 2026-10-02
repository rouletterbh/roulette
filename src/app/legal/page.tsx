import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Legal",
  description: "Index of legal documents: terms, privacy, cookies, risk disclosure, AML, Stock Token disclosure, restricted jurisdictions and responsible play.",
};

const docs = [
  { href: "/terms", title: "Terms of Service", body: "The agreement between you and the operator for using the interface and the protocol." },
  { href: "/privacy", title: "Privacy Policy", body: "What data the interface collects, why, how long it is kept and your rights over it." },
  { href: "/cookies", title: "Cookie Notice", body: "The small set of browser storage the interface uses and how to control it." },
  { href: "/risk-disclosure", title: "Risk Disclosure", body: "The risks of onchain play: house edge, software, network, market and jurisdictional." },
  { href: "/aml", title: "AML & Sanctions Policy", body: "How the operator approaches anti-money-laundering obligations and screening." },
  { href: "/stock-token-disclosure", title: "Stock Token Disclosure", body: "What Stock Tokens are and are not, and when reward settlement in them is possible." },
  { href: "/restricted-jurisdictions", title: "Restricted Jurisdictions", body: "Where real-money play is and is not offered, and how the gate works." },
  { href: "/responsible-play", title: "Responsible Play", body: "Limits, cooldowns, self-exclusion and account lock: tools you set for yourself.", tool: true },
];

export default function LegalIndexPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Legal</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">The documents, in one place.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          Every document governing {siteConfig.name}. All are drafts pending counsel review; placeholders mark where jurisdiction-specific language
          is still required.
        </p>
      </div>

      <ul className="mt-16 max-w-4xl divide-y divide-hairline hairline-t hairline-b">
        {docs.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="group grid gap-2 py-7 transition-colors md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] md:items-baseline md:gap-10"
            >
              <span className="font-display text-3xl leading-none text-ink">{d.title}</span>
              <span className="text-[14.5px] leading-relaxed text-muted">{d.body}</span>
              <span className="flex items-center gap-3 md:justify-end">
                <Badge tone="outline">{d.tool ? "Tools" : "Draft"}</Badge>
                <span className="text-muted transition-transform group-hover:translate-x-1" aria-hidden>
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 max-w-xl text-[13.5px] text-muted">
        Security practices, contract status and responsible disclosure are described on the{" "}
        <Link href="/security" className="text-ink underline underline-offset-2">Security page</Link>.
      </p>
    </div>
  );
}
