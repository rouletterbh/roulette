import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { LegalPlaceholder } from "@/components/ui/prose";
import { siteConfig } from "@/config/site";
import { jurisdictionNotice, jurisdictionSummary, jurisdictions, type JurisdictionStatus } from "@/config/jurisdictions";

export const metadata: Metadata = {
  title: "Restricted jurisdictions",
  description: "Where real-money play is and is not offered, and how the jurisdiction gate works.",
};

const statusLabel: Record<JurisdictionStatus, { label: string; tone: "accent" | "red" | "outline" }> = {
  enabled: { label: "Enabled", tone: "accent" },
  restricted: { label: "Restricted", tone: "red" },
  "pending-review": { label: "Pending review", tone: "outline" },
};

export default function RestrictedJurisdictionsPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Restricted jurisdictions</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Where you can play, and where you cannot yet.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">{jurisdictionNotice}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Badge tone="outline">Draft</Badge>
          <span className="text-[12.5px] text-muted">
            {jurisdictionSummary.enabled} enabled · {jurisdictionSummary.restricted} restricted · {jurisdictionSummary.pendingReview} pending review
          </span>
        </div>
      </div>

      <section className="mt-16 grid max-w-5xl gap-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-16" aria-labelledby="gate">
        <Eyebrow className="md:sticky md:top-28 md:self-start">The gate</Eyebrow>
        <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-muted [&_strong]:font-medium [&_strong]:text-ink">
          <h2 id="gate" className="font-display text-display-sm text-balance text-ink">
            Real money is off by default, everywhere.
          </h2>
          <p>
            {siteConfig.name} keeps a single configuration file listing every region it has considered. A region can be{" "}
            <strong>enabled</strong>, <strong>restricted</strong> or <strong>pending review</strong>. Only an entry that is explicitly enabled, after
            written confirmation from counsel, allows real-money tables to be shown. Regions not in the list are treated as restricted.
          </p>
          <p>
            The interface will check your region before showing anything that moves money and will also ask you to confirm you are of legal age and
            accept the Terms. Practice mode carries no money and no rewards, needs no wallet and is not subject to the gate.
          </p>
          <p>
            Stock Token settlement is gated separately and more narrowly; see the{" "}
            <Link href="/stock-token-disclosure" className="text-ink underline underline-offset-2">Stock Token disclosure</Link>.
          </p>
          <LegalPlaceholder>
            Method of jurisdiction determination (self-declaration, IP geolocation, wallet screening or a combination), appeals process and record
            retention must be specified by counsel per enabled region.
          </LegalPlaceholder>
        </div>
      </section>

      <section className="mt-20 max-w-5xl" aria-labelledby="table">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="table" className="font-display text-3xl">Regions under consideration</h2>
          <span className="text-[13px] text-muted">Source: src/config/jurisdictions.ts</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="border-b border-border py-3 pr-4 font-medium">Code</th>
                <th className="border-b border-border py-3 pr-4 font-medium">Region</th>
                <th className="border-b border-border py-3 pr-4 font-medium">Status</th>
                <th className="border-b border-border py-3 pr-4 font-medium">Real money</th>
                <th className="border-b border-border py-3 pr-4 font-medium">Practice</th>
                <th className="border-b border-border py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {jurisdictions.map((j) => {
                const st = statusLabel[j.status];
                return (
                  <tr key={j.code} className="align-top">
                    <td className="border-b border-hairline py-3.5 pr-4 font-mono text-[13px]">{j.code}</td>
                    <td className="border-b border-hairline py-3.5 pr-4 text-ink">{j.name}</td>
                    <td className="border-b border-hairline py-3.5 pr-4">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="border-b border-hairline py-3.5 pr-4 text-muted">{j.realMoney ? "Yes" : "No"}</td>
                    <td className="border-b border-hairline py-3.5 pr-4 text-muted">{j.practice ? "Free" : "No"}</td>
                    <td className="border-b border-hairline py-3.5 text-[13px] text-muted">{j.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-6 max-w-xl text-[13px] text-muted">
          This list is not a statement that play is lawful anywhere. It records which regions have been queued for review. It will be updated only
          when counsel confirms a status in writing.
        </p>
      </section>
    </div>
  );
}
