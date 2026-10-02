import Link from "next/link";
import { PlayerAvatar } from "./player-avatar";
import type { LeaderboardCategory, LeaderboardRow } from "@/lib/demo/players";
import { cn } from "@/lib/utils";

export const categoryMeta: Record<LeaderboardCategory, { label: string; valueHeading: string; unit: string }> = {
  "biggest-win": { label: "Biggest Win", valueHeading: "Net win", unit: "chips" },
  "most-games": { label: "Most Games", valueHeading: "Rounds", unit: "settled" },
  "longest-streak": { label: "Longest Streak", valueHeading: "Streak", unit: "consecutive" },
};

/**
 * Editorial ranking table: hairline rows, serif rank numerals, tabular values.
 * The first three rows are set in ink with larger numerals; everyone else in
 * the same structure, quieter. No podium.
 */
export function LeaderboardTable({ rows, category, className, highlightWallet }: { rows: LeaderboardRow[]; category: LeaderboardCategory; className?: string; highlightWallet?: string | null }) {
  const meta = categoryMeta[category];
  if (rows.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border px-6 py-14 text-center", className)}>
        <p className="font-display text-2xl text-ink">Nothing to rank yet.</p>
        <p className="mt-2 text-[13.5px] text-muted">No settled rounds in this window.</p>
      </div>
    );
  }
  return (
    <table className={cn("w-full border-collapse", className)}>
      <caption className="sr-only">
        {meta.label} leaderboard, {rows.length} players
      </caption>
      <thead>
        <tr className="hairline-b text-left">
          <th scope="col" className="eyebrow w-12 pb-3 font-medium">
            #
          </th>
          <th scope="col" className="eyebrow pb-3 font-medium">
            Player
          </th>
          <th scope="col" className="eyebrow hidden pb-3 font-medium md:table-cell">
            Context
          </th>
          <th scope="col" className="eyebrow pb-3 text-right font-medium">
            {meta.valueHeading}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const top = r.rank <= 3;
          const me = highlightWallet && r.wallet.toLowerCase() === highlightWallet.toLowerCase();
          return (
            <tr key={r.wallet} className={cn("hairline-b transition-colors hover:bg-sunken/60 dark:hover:bg-elevated/60", me && "bg-accent-soft/40")}>
              <td className="py-4 pr-3 align-middle">
                <span className={cn("font-display tnum leading-none", top ? "text-3xl text-ink md:text-4xl" : "text-xl text-muted")}>{r.rank}</span>
              </td>
              <td className="py-4 pr-4 align-middle">
                <Link href={`/player/${r.wallet}`} className="group inline-flex min-w-0 items-center gap-3">
                  <PlayerAvatar address={r.wallet} size={top ? 36 : 28} name={r.displayName} />
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[14.5px] font-medium group-hover:underline group-hover:underline-offset-4", top ? "text-ink" : "text-ink-2")}>
                      {r.displayName}
                      {me && <span className="ml-2 text-[10.5px] uppercase tracking-[0.12em] text-muted">You</span>}
                    </span>
                    {r.detail && <span className="mt-0.5 block truncate text-[12px] text-muted md:hidden">{r.detail}</span>}
                  </span>
                </Link>
              </td>
              <td className="hidden py-4 pr-4 align-middle text-[13px] text-muted md:table-cell">{r.detail}</td>
              <td className="py-4 text-right align-middle">
                <span className={cn("font-display tnum leading-none", top ? "text-3xl text-ink" : "text-2xl text-ink-2")}>{r.valueLabel}</span>
                <span className="ml-1.5 text-[11px] uppercase tracking-[0.1em] text-faint">{meta.unit}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
