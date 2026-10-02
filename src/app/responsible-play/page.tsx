import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LegalPlaceholder } from "@/components/ui/prose";
import { ResponsibleTools } from "@/components/responsible/responsible-tools";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Responsible play",
  description: "Session reminders, cooldowns, self-exclusion, deposit and loss limits, daily time limits and an account lock. Your controls, set by you.",
};

export default function ResponsiblePlayPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Responsible play</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">Set the terms before you sit down.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          Roulette is entertainment with a built-in house edge. These controls let you decide, in advance and in a calm moment, how much time and
          money you want to give it. They apply to real-money play; practice mode is always open.
        </p>
      </div>

      <div className="mt-16 max-w-5xl">
        <ResponsibleTools />
      </div>

      <section className="mt-24 grid max-w-5xl gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-14" aria-labelledby="how-these-work">
        <div className="max-w-sm">
          <h2 id="how-these-work" className="font-display text-3xl leading-none">How these controls work</h2>
        </div>
        <ul className="space-y-4 text-[14.5px] leading-relaxed text-muted">
          <li>
            <strong className="font-medium text-ink">Tightening is instant; loosening waits.</strong> Lowering a limit, locking your account or
            starting a cooldown applies immediately. Raising a limit or unlocking takes 24 hours, so the decision is made by you and not by the moment.
          </li>
          <li>
            <strong className="font-medium text-ink">Self-exclusion and cooldowns cannot be cut short.</strong> They can be extended.
          </li>
          <li>
            <strong className="font-medium text-ink">Time is counted while the tab is visible.</strong> The session clock and the daily total pause
            when you switch away and start a new session after 30 minutes of absence.
          </li>
          <li>
            <strong className="font-medium text-ink">Settings live in this browser.</strong> They are stored locally and are not yet synced to your
            wallet address. Clearing site data clears them. Wallet-linked enforcement is planned before real-money play is enabled anywhere.
          </li>
          <li>
            <strong className="font-medium text-ink">No number is ever due.</strong> Each spin is independent; a losing streak does not make a win
            more likely, and a winning streak does not make one less likely.
          </li>
        </ul>
      </section>

      <section className="mt-24 grid max-w-5xl gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-14" aria-labelledby="help">
        <div className="max-w-sm">
          <h2 id="help" className="font-display text-3xl leading-none">If play stops being fun</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
            Talking to someone helps, and it is free. Independent organisations offer confidential support in most regions.
          </p>
        </div>
        <div className="space-y-4 text-[14.5px] leading-relaxed text-muted">
          <LegalPlaceholder>
            Insert region-appropriate, independent problem-gambling support organisations (name, phone, website, hours) for each jurisdiction
            where real-money play is enabled. Do not publish until verified by counsel.
          </LegalPlaceholder>
          <LegalPlaceholder>
            Insert any jurisdiction-mandated responsible-gambling notices, age statements and self-exclusion register links required by the local regulator.
          </LegalPlaceholder>
          <p>
            Questions about these controls or about {siteConfig.name}: see the <Link href="/faq" className="text-ink underline underline-offset-2">FAQ</Link>{" "}
            or the <Link href="/risk-disclosure" className="text-ink underline underline-offset-2">Risk Disclosure</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
