import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { RoundVerifier } from "@/components/fairness/round-verifier";

export const metadata: Metadata = { title: "Provably fair" };

const steps = [
  { n: "01", t: "Commit", d: "Before any bet is accepted, the operator publishes keccak256(serverSeed). The seed itself stays secret." },
  { n: "02", t: "Bet", d: "Players place bets. Their combined bet data forms the player seed, so the operator can't tune the result to the table." },
  { n: "03", t: "Reveal", d: "After betting closes, the server seed is revealed and must hash to the commitment. A future block hash adds entropy neither side controls." },
  { n: "04", t: "Derive", d: "result = keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ roundId) mod 37. The wheel animation only replays this number." },
];

export default function FairnessPage() {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-2xl">
        <Eyebrow className="mb-4 block">Provably fair</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">The wheel never decides. It only shows.</h1>
        <p className="mt-5 max-w-lg text-base text-muted md:text-lg">Every result is committed before bets open and can be recomputed by anyone afterwards. No Math.random, no server-side reroll, no client-side anything.</p>
      </div>

      <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="bg-surface p-6 dark:bg-elevated">
            <span className="font-display text-4xl text-faint">{s.n}</span>
            <h2 className="font-display mt-6 text-2xl">{s.t}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.d}</p>
          </li>
        ))}
      </ol>

      <section className="mt-16 grid gap-10 lg:grid-cols-2">
        <div className="rounded-2xl border border-border p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="eyebrow">Example · Round #23821</h2><Badge tone="accent">Verified</Badge></div>
          <dl className="divide-y divide-hairline text-[12.5px]">
            {[
              ["Server commitment", "0x6d2b…9f3a"],
              ["Player seed", "0x9a41…0c77"],
              ["Block reference", "0x31e0…b2d4 (block 1,204,331)"],
              ["Result", "17 BLACK"],
              ["Status", "VERIFIED"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] gap-3 py-2"><dt className="text-muted">{k}</dt><dd className="font-mono text-[11.5px]">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-[11.5px] text-muted">Illustrative values. Real rounds publish full 32-byte seeds and link to the transaction on Robinhood Chain.</p>
        </div>
        <div className="text-[14.5px] leading-relaxed text-ink-2">
          <h2 className="font-display mb-3 text-3xl text-ink">What this guarantees</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>The operator cannot change the result after seeing the bets: the seed was fixed before betting opened.</li>
            <li>Players cannot predict the result: the seed is secret until reveal and the block reference is unknown at bet time.</li>
            <li>An unrevealed round can&apos;t be silently dropped: unrevealed rounds void and refund stakes.</li>
            <li>Anyone can audit: every value needed to recompute a round is published onchain.</li>
          </ul>
          <p className="mt-4 text-[12.5px] text-muted">Verifiable randomness (VRF) can be swapped in behind the same interface. Table limits are a separate guarantee: see <Link href="/treasury" className="underline underline-offset-2">Treasury</Link>.</p>
        </div>
      </section>

      <section className="mt-20 border-t border-hairline pt-14">
        <Suspense fallback={null}><RoundVerifier /></Suspense>
      </section>
    </div>
  );
}
