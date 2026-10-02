import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Tournaments",
  description: "Tournaments are architected but not enabled, pending separate regulatory and product approval.",
};

const rounds = [
  { label: "Round of 8", seats: 8 },
  { label: "Semi-finals", seats: 4 },
  { label: "Final", seats: 2 },
  { label: "Winner", seats: 1 },
];

export default function TournamentsPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <Eyebrow>Tournaments</Eyebrow>
          <Badge tone="outline">Beta · disabled</Badge>
        </div>
        <h1 className="font-display text-display-lg text-balance">Built. Not switched on.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
          Tournament play at {siteConfig.name} is architected as a separate module, with its own rules, prize structure and approvals. It stays
          disabled until that review is complete; nothing on this page accepts entries or moves money.
        </p>
      </div>

      <section className="mt-16 max-w-3xl grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-16" aria-labelledby="why">
        <Eyebrow className="md:sticky md:top-28 md:self-start">Why it waits</Eyebrow>
        <div className="space-y-4 text-[15px] leading-relaxed text-muted">
          <h2 id="why" className="font-display text-display-sm text-balance text-ink">
            Prizes change the rules.
          </h2>
          <p>
            A standard table pays fixed odds from a treasury that is checked before every bet. A tournament pools entries toward a prize, which is a
            different product with different obligations in most places. We would rather ship it correctly than early.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Separate regulatory and product approval, region by region.</li>
            <li>Prize funding held in its own escrow, never drawn from the game treasury.</li>
            <li>Same commit–reveal fairness and the same responsible-play controls as every table.</li>
            <li>Practice tournaments with no money or rewards are being considered first.</li>
          </ul>
        </div>
      </section>

      {/* Mock, disabled UI */}
      <section className="mt-20 max-w-5xl" aria-labelledby="preview">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 id="preview" className="font-display text-3xl">Preview of the shape</h2>
          <span className="text-[12.5px] text-muted">Illustration only. No entries, no prizes, no live data.</span>
        </div>

        <div inert aria-hidden className="select-none opacity-60">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Bracket */}
            <div className="bg-surface p-6 dark:bg-elevated">
              <div className="mb-5 flex items-center justify-between">
                <span className="eyebrow">Bracket</span>
                <Badge tone="outline">Beta · disabled</Badge>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {rounds.map((r) => (
                  <div key={r.label} className="flex flex-col justify-around gap-2">
                    <span className="mb-1 text-[11px] text-muted">{r.label}</span>
                    {Array.from({ length: r.seats }).map((_, i) => (
                      <div
                        key={i}
                        className="flex h-9 items-center justify-between rounded-md border border-border px-2.5 text-[12px] text-faint"
                      >
                        <span className="h-2 w-12 rounded-full bg-sunken dark:bg-surface" />
                        <span className="tnum">—</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-surface p-6 dark:bg-elevated">
              <div className="mb-5 flex items-center justify-between">
                <span className="eyebrow">Leaderboard</span>
                <span className="text-[11px] text-faint">Not live</span>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] text-muted">
                    <th className="border-b border-border pb-2 font-medium">#</th>
                    <th className="border-b border-border pb-2 font-medium">Player</th>
                    <th className="border-b border-border pb-2 text-right font-medium">Rounds</th>
                    <th className="border-b border-border pb-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="border-b border-hairline py-2.5 tnum text-faint">{i + 1}</td>
                      <td className="border-b border-hairline py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full border border-border" />
                          <span className="h-2 w-20 rounded-full bg-sunken dark:bg-surface" />
                        </span>
                      </td>
                      <td className="border-b border-hairline py-2.5 text-right tnum text-faint">—</td>
                      <td className="border-b border-hairline py-2.5 text-right tnum text-faint">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-5">
                <Button size="md" variant="outline" disabled>
                  Enter tournament
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-16 flex flex-wrap gap-3">
        <Button href="/play" variant="outline">Play a table instead</Button>
        <Button href="/play/practice" variant="ghost">Practice for free</Button>
      </div>
    </div>
  );
}
