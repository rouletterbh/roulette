import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { formatDemoDate, type DemoClaim } from "@/lib/demo/players";
import { formatUsd, cn } from "@/lib/utils";

/** Claimable win balance with a single clear action. */
export function RewardsPanel({ winBalance, compact = false, className }: { winBalance: number; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6 md:flex-row md:items-end md:justify-between", className)}>
      <div>
        <div className="flex items-center gap-2">
          <span className="eyebrow">Claimable win balance</span>
          <DemoBadge />
        </div>
        <p className="mt-2 font-display text-5xl tnum md:text-6xl">{formatUsd(winBalance)}</p>
        {!compact && (
          <p className="mt-3 max-w-md text-[13.5px] text-muted">
            Wins settle to a win balance held by the treasury, separate from the bankroll that collateralizes wagers. Claim to your wallet in a supported asset at any time.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button href="/cashier" variant="accent">
          Claim
        </Button>
        {compact && (
          <Button href="/me/rewards" variant="outline">
            Rewards
          </Button>
        )}
      </div>
    </div>
  );
}

const claimTone: Record<DemoClaim["status"], { label: string; tone: "accent" | "muted" | "outline" }> = {
  claimable: { label: "Claimable", tone: "accent" },
  claimed: { label: "Claimed", tone: "muted" },
  vesting: { label: "Vesting", tone: "outline" },
};

export function ClaimsList({ claims, className }: { claims: DemoClaim[]; className?: string }) {
  return (
    <ol className={cn("divide-y divide-hairline", className)} aria-label="Claims">
      {claims.map((c) => {
        const t = claimTone[c.status];
        return (
          <li key={c.id} className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[14px] text-ink">
                {formatUsd(c.amount)} <span className="text-muted">{c.asset}</span>
              </p>
              <p className="text-[12px] text-muted">{formatDemoDate(c.at)}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={t.tone}>{t.label}</Badge>
              {c.status === "claimable" ? (
                <Link href="/cashier" className="text-[13px] underline underline-offset-4 hover:text-ink">
                  Claim
                </Link>
              ) : (
                <span className="text-[13px] text-faint">—</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
