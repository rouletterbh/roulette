"use client";

import { useState } from "react";
import type { RoundCommitment, RoundReveal } from "@/lib/fairness/commit-reveal";
import { verifyRound } from "@/lib/fairness/commit-reveal";
import { colorOf } from "@/lib/roulette/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function FairnessProof({ commitment, reveal, compact, className }: { commitment: RoundCommitment | null; reveal?: RoundReveal | null; compact?: boolean; className?: string }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const r = reveal;
  const row = (label: string, value: string | null | undefined, mono = true) => (
    <div className="grid grid-cols-[96px_1fr] items-baseline gap-3 py-1.5 text-[12.5px]">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("min-w-0 truncate", mono && "font-mono text-[11.5px]")} title={value ?? undefined}>
        {value ?? <span className="text-faint">— revealed after the round</span>}
      </dd>
    </div>
  );
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 dark:bg-elevated", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Round #{commitment?.roundId ?? "—"}</h3>
        {r ? (
          <Badge tone={r.verified ? "accent" : "red"}>{r.verified ? "Verified" : "Mismatch"}</Badge>
        ) : (
          <Badge tone="outline">Committed</Badge>
        )}
      </div>
      <dl className="divide-y divide-hairline">
        {row("Commitment", commitment?.commitment)}
        {row("Player seed", commitment?.playerSeed)}
        {row("Server seed", r?.serverSeed)}
        {row("Block ref", r?.blockReference)}
        {!compact && row("Result", r ? `${r.result} ${colorOf(r.result).toUpperCase()}` : null, false)}
      </dl>
      {r && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setVerified(verifyRound(r))}
            className="h-9 rounded-full border border-border px-4 text-[12px] font-medium uppercase tracking-[0.08em] transition-colors hover:border-ink"
          >
            Verify round
          </button>
          {verified != null && (
            <span className={cn("text-[12.5px]", verified ? "text-ink" : "text-casino-red")} role="status">
              {verified ? "Recomputed locally: hash and result match." : "Verification failed."}
            </span>
          )}
        </div>
      )}
      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        result = keccak256(serverSeed ‖ playerSeed ‖ blockRef ‖ roundId) mod 37. The commitment is published before bets open; the seed is revealed after.
      </p>
    </div>
  );
}
