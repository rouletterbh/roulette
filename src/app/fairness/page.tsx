import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { RoundVerifier } from "@/components/fairness/round-verifier";

export const metadata: Metadata = { title: "Provably fair" };

const example: Array<[string, string]> = [
  ["Server commitment", "0x6d2b…9f3a"],
  ["Player seed", "0x9a41…0c77"],
  ["Block reference", "0x31e0…b2d4 (block 1,204,331)"],
  ["Result", "17 BLACK"],
  ["Status", "VERIFIED"],
];

const guarantees = [
  "The operator cannot change the result after seeing the bets: the seed was fixed before betting opened.",
  "Players cannot predict the result: the seed is secret until reveal and the block reference is unknown at bet time.",
  "An unrevealed round can't be silently dropped: unrevealed rounds void and refund stakes.",
  "Anyone can audit: every value needed to recompute a round is published onchain.",
];

export default function FairnessPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <header className="blueprint-radial">
        <div className="relative z-10 max-w-2xl">
          <Eyebrow className="mb-4 block">Provably fair</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">The wheel does not get to change its mind.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every result is committed before bets open and can be recomputed by anyone afterwards. No Math.random, no server-side reroll, no client-side anything.</p>
        </div>
      </header>

      {/* Pipeline + verifier (client) */}
      <Suspense fallback={null}>
        <RoundVerifier />
      </Suspense>

      {/* Example + guarantees */}
      <section className="mt-20 grid gap-12 border-t border-border pt-12 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between">
            <h2 className="microlabel !text-ink">Example · Round #23821</h2>
            <span className="microlabel inline-flex items-center gap-1.5 !text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Verified
            </span>
          </div>
          <dl className="mt-3 divide-y divide-hairline border-y border-hairline text-[12.5px]">
            {example.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-3 py-2.5 sm:grid-cols-[150px_1fr]">
                <dt className="microlabel">{k}</dt>
                <dd className="min-w-0 break-all font-mono text-[11.5px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-muted">Illustrative values. Real rounds publish full 32-byte seeds and link to the transaction on Robinhood Chain.</p>
        </div>
        <div className="min-w-0 text-[14.5px] leading-relaxed text-ink-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-ink md:text-3xl">What this guarantees</h2>
            <span className="microlabel">02 / Guarantees</span>
          </div>
          <ol className="mt-4 divide-y divide-hairline border-y border-hairline">
            {guarantees.map((g, i) => (
              <li key={g} className="grid grid-cols-[32px_1fr] gap-3 py-3">
                <span className="font-mono text-[11px] tnum text-faint">0{i + 1}</span>
                <span>{g}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[12.5px] text-muted">
            Verifiable randomness (VRF) can be swapped in behind the same interface. Table limits are a separate guarantee: see{" "}
            <Link href="/treasury" className="underline underline-offset-2">
              Treasury
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
