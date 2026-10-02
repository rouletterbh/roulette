import { NumberPill } from "@/components/ui/number-pill";
import { cn } from "@/lib/utils";

export function RecentNumbers({ numbers, size = "sm", className, max = 12 }: { numbers: number[]; size?: "sm" | "md" | "lg"; className?: string; max?: number }) {
  const list = numbers.slice(0, max);
  if (list.length === 0) return <span className={cn("text-[12px] text-muted", className)}>No results yet</span>;
  return (
    <ol className={cn("flex flex-wrap items-center gap-1", className)} aria-label="Recent results, newest first">
      {list.map((n, i) => (
        <li key={`${n}-${i}`} className={cn(i === 0 && "mr-0.5")}>
          <NumberPill n={n} size={size} highlight={i === 0} />
        </li>
      ))}
    </ol>
  );
}
