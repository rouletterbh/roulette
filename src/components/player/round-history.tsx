import Link from "next/link";
import { NumberPill } from "@/components/ui/number-pill";
import { formatDemoDateTime, demoRelativeTime, type DemoRound } from "@/lib/demo/players";
import { cn } from "@/lib/utils";

/** Signed net with an accent dot for wins. The sign and the word carry meaning; the dot is decoration. */
export function NetValue({ net, className }: { net: number; className?: string }) {
  const win = net > 0;
  return (
    <span className={cn("inline-flex items-center gap-2 tnum", win ? "text-ink" : "text-muted", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", win ? "bg-accent ring-1 ring-black/10 dark:ring-white/10" : "bg-faint/50")} aria-hidden />
      <span>
        {win ? "+" : net < 0 ? "−" : ""}
        {Math.abs(net).toLocaleString("en-US")}
      </span>
      <span className="sr-only">{win ? "win" : net < 0 ? "loss" : "push"}</span>
    </span>
  );
}

/**
 * Round history. Desktop: hairline table. Mobile: a purpose-built list where
 * each round is a compact definition block (no squeezed six-column table).
 */
export function RoundHistory({ rounds, className, emptyLabel = "No rounds yet." }: { rounds: DemoRound[]; className?: string; emptyLabel?: string }) {
  if (rounds.length === 0) {
    return <p className={cn("rounded-2xl border border-dashed border-border px-6 py-12 text-center text-[13.5px] text-muted", className)}>{emptyLabel}</p>;
  }
  return (
    <div className={className}>
      {/* Desktop table */}
      <table className="hidden w-full border-collapse md:table">
        <caption className="sr-only">Round history, newest first</caption>
        <thead>
          <tr className="hairline-b text-left">
            {["When", "Table", "Bets", "Result", "Net", "Proof"].map((h, i) => (
              <th key={h} scope="col" className={cn("eyebrow pb-3 font-medium", i >= 4 && "text-right", i === 3 && "text-center")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.roundId} className="hairline-b align-middle transition-colors hover:bg-sunken/60 dark:hover:bg-elevated/60">
              <td className="py-3.5 pr-4 text-[13px] text-muted">
                <time dateTime={new Date(r.at).toISOString()} title={formatDemoDateTime(r.at)}>
                  {demoRelativeTime(r.at)}
                </time>
              </td>
              <td className="py-3.5 pr-4 text-[13px] text-ink-2">{r.tableName}</td>
              <td className="py-3.5 pr-4 text-[13px] text-ink-2">
                <span className="block max-w-[28ch] truncate" title={r.betsSummary}>
                  {r.betsSummary}
                </span>
                <span className="text-[11.5px] text-muted tnum">{r.wagered} staked</span>
              </td>
              <td className="py-3.5 text-center">
                <NumberPill n={r.result} size="sm" />
              </td>
              <td className="py-3.5 pl-4 text-right text-[14px]">
                <NetValue net={r.net} className="justify-end" />
              </td>
              <td className="py-3.5 pl-4 text-right text-[12.5px]">
                <Link href={`/fairness?round=${r.roundId}`} className="text-muted underline-offset-4 hover:text-ink hover:underline tnum">
                  #{r.roundId}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <ol className="md:hidden">
        {rounds.map((r) => (
          <li key={r.roundId} className="hairline-b py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <time dateTime={new Date(r.at).toISOString()}>{demoRelativeTime(r.at)}</time>
                  <span aria-hidden>·</span>
                  <span>{r.tableName}</span>
                </div>
                <p className="mt-1 truncate text-[13.5px] text-ink-2">{r.betsSummary}</p>
                <Link href={`/fairness?round=${r.roundId}`} className="mt-1 inline-block text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline tnum">
                  Proof #{r.roundId}
                </Link>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <NumberPill n={r.result} size="sm" />
                <NetValue net={r.net} className="text-[14px]" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
