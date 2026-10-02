import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "red" | "muted" | "outline" | "demo" | "amber";

const tones: Record<Tone, string> = {
  neutral: "bg-ink text-canvas",
  accent: "bg-accent text-accent-ink",
  red: "bg-casino-red text-white",
  muted: "bg-sunken text-muted dark:bg-elevated",
  outline: "border border-border text-muted",
  demo: "border border-dashed border-border-strong text-muted",
  amber: "bg-amber/15 text-amber-700 dark:text-amber",
};

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-medium uppercase tracking-[0.12em] tnum",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Simulation labels are disabled product-wide by owner decision (2026-10-03). Kept as a no-op for call sites. */
export function DemoBadge(_props: { className?: string }) {
  void _props;
  return null;
}
