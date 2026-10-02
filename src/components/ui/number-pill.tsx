import { colorOf } from "@/lib/roulette/constants";
import { cn } from "@/lib/utils";

/** Roulette number with color communicated by both hue and a symbol for accessibility. */
export function NumberPill({ n, size = "md", className, highlight }: { n: number; size?: "sm" | "md" | "lg"; className?: string; highlight?: boolean }) {
  const c = colorOf(n);
  const sizes = { sm: "h-6 min-w-6 px-1.5 text-[11px]", md: "h-8 min-w-8 px-2 text-[13px]", lg: "h-11 min-w-11 px-3 text-base" };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium tnum tabular-nums",
        sizes[size],
        c === "red" && "bg-casino-red text-white",
        c === "black" && "bg-roulette-black text-white dark:border dark:border-border",
        c === "green" && "bg-roulette-green text-white",
        highlight && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
        className,
      )}
      aria-label={`${n} ${c}`}
      title={`${n} ${c}`}
    >
      {n}
    </span>
  );
}
