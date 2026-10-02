import { colorStats } from "@/lib/demo/data";
import { cn } from "@/lib/utils";

/** Neutral statistics only. No "due" language — every spin is independent. */
export function TableStats({ numbers, className }: { numbers: number[]; className?: string }) {
  const last = numbers.slice(0, 100);
  const c = colorStats(last);
  const n = last.length || 1;
  const pct = (v: number) => Math.round((v / n) * 100);
  return (
    <div className={cn("text-[12.5px]", className)}>
      <div className="mb-2 flex items-center justify-between text-muted">
        <span>Last {last.length}</span>
        <span className="text-[11px]">each spin is independent</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-sunken dark:bg-surface" aria-hidden>
        <span className="bg-casino-red" style={{ width: `${pct(c.red)}%` }} />
        <span className="bg-roulette-black" style={{ width: `${pct(c.black)}%` }} />
        <span className="bg-roulette-green" style={{ width: `${pct(c.green)}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 tnum">
        <div><dt className="text-muted">Red</dt><dd className="font-medium">{c.red}</dd></div>
        <div><dt className="text-muted">Black</dt><dd className="font-medium">{c.black}</dd></div>
        <div><dt className="text-muted">Green</dt><dd className="font-medium">{c.green}</dd></div>
      </dl>
    </div>
  );
}
