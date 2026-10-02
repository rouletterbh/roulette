import { PlayerAvatar } from "./player-avatar";
import { cn } from "@/lib/utils";

export function PlayerStack({ count, seed, max = 4, size = 24, className }: { count: number; seed: string; max?: number; size?: number; className?: string }) {
  const shown = Math.min(count, max);
  const extra = count - shown;
  if (count === 0) return null;
  return (
    <div className={cn("flex items-center", className)} aria-label={`${count} players at table`}>
      {Array.from({ length: shown }).map((_, i) => (
        <PlayerAvatar key={i} address={`${seed}-${i}`} size={size} className="-ml-1.5 ring-2 ring-surface first:ml-0 dark:ring-elevated" />
      ))}
      {extra > 0 && <span className="ml-1.5 text-[12px] tnum text-muted">+{extra}</span>}
    </div>
  );
}
