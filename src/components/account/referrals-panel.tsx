"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOrigin } from "@/lib/hooks/use-mounted";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatList } from "@/components/ui/stat";
import { formatDemoDate, getAccountDemo } from "@/lib/demo/players";
import { formatUsd, shortAddress } from "@/lib/utils";

const statusMeta = {
  vested: { label: "Vested", tone: "accent" as const, note: "Reward credited" },
  vesting: { label: "Vesting", tone: "outline" as const, note: "Real-money play verified, vesting" },
  pending: { label: "Pending", tone: "muted" as const, note: "Waiting for verified play" },
};

/** Referral link, code, referred players and eligible rewards. Demo values. */
export function ReferralsPanel({ address }: { address: string }) {
  const { referrals } = getAccountDemo(address);
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const url = `${origin}/?ref=${referrals.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the field is selectable */
    }
  };

  const eligible = referrals.referred.filter((r) => r.status !== "pending").reduce((s, r) => s + r.reward, 0);
  const vested = referrals.referred.filter((r) => r.status === "vested").reduce((s, r) => s + r.reward, 0);

  return (
    <div className="space-y-14">
      <section aria-labelledby="ref-link">
        <div className="flex items-center gap-2">
          <h2 id="ref-link" className="eyebrow">
            Your referral link
          </h2>
          <DemoBadge />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={url}
            aria-label="Referral URL"
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-5 font-mono text-[13.5px] tnum text-ink dark:bg-elevated"
          />
          <Button variant="primary" size="lg" onClick={copy} aria-live="polite" className="sm:w-32">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={copied ? "c" : "n"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
                {copied ? "Copied" : "Copy link"}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Code <span className="font-mono tnum text-ink">{referrals.code}</span> · one referral per wallet, bound at first play.
        </p>
      </section>

      <StatList
        columns={3}
        items={[
          { label: "Players referred", value: referrals.referred.length },
          { label: "Eligible rewards", value: formatUsd(eligible), hint: "vesting + vested" },
          { label: "Vested", value: formatUsd(vested), hint: "credited to win balance" },
        ]}
      />

      <section aria-labelledby="ref-list">
        <h2 id="ref-list" className="font-display text-3xl">
          Referred players
        </h2>
        <ol className="mt-5 divide-y divide-hairline">
          {referrals.referred.map((r) => {
            const m = statusMeta[r.status];
            return (
              <li key={r.wallet} className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="font-mono text-[13.5px] tnum text-ink">{shortAddress(r.wallet, 6)}</p>
                  <p className="text-[12px] text-muted">
                    Joined {formatDemoDate(r.joinedAt)} · {m.note}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[14px] tnum text-ink">{r.reward > 0 ? formatUsd(r.reward) : "—"}</span>
                  <Badge tone={m.tone}>{m.label}</Badge>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="ref-rules" className="rounded-2xl border border-border p-6 md:p-8">
        <h2 id="ref-rules" className="font-display text-3xl">
          How rewards stay honest
        </h2>
        <dl className="mt-6 grid gap-6 text-[14px] md:grid-cols-2">
          <div>
            <dt className="font-medium text-ink">One referral per wallet</dt>
            <dd className="mt-1 text-muted">A wallet can be referred once, by one referrer, and only before its first settled round. Self-referrals from linked wallets are rejected.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Rewards vest after verified real-money play</dt>
            <dd className="mt-1 text-muted">Nothing vests on sign-up or on practice chips. A referred player must settle real rounds over time; wash betting and mirrored wagers do not count.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Never funded from collateral</dt>
            <dd className="mt-1 text-muted">Referral rewards come from the reward inventory, never from the bankroll that collateralizes open wagers or from player escrow.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Sybil resistance</dt>
            <dd className="mt-1 text-muted">Clusters of wallets funded from one source, shared devices and timing patterns are reviewed; flagged rewards are paused, not paid.</dd>
          </div>
        </dl>
        <p className="mt-6 text-[12.5px] text-faint">[LEGAL COUNSEL REVIEW REQUIRED] Referral terms may vary by jurisdiction.</p>
      </section>
    </div>
  );
}
