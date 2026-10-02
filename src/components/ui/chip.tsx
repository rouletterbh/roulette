import { cn } from "@/lib/utils";

/**
 * Physical-looking casino chip. Denominations map to ERC-1155 token ids.
 * Rendered in pure CSS so it stays crisp at any size.
 */
export const chipPalette: Record<number, { color: string; edge: string; ink: string }> = {
  1: { color: "#f3f3ee", edge: "#111311", ink: "#080a08" },
  5: { color: "#d7263d", edge: "#f3f3ee", ink: "#ffffff" },
  10: { color: "#2a5bff", edge: "#f3f3ee", ink: "#ffffff" },
  25: { color: "#178a4c", edge: "#f3f3ee", ink: "#ffffff" },
  50: { color: "#6b4cff", edge: "#f3f3ee", ink: "#ffffff" },
  100: { color: "#111311", edge: "#c8ff00", ink: "#c8ff00" },
};

export function Chip({
  value,
  size = 44,
  className,
  label,
  practice,
  style,
}: {
  value: number;
  size?: number;
  className?: string;
  label?: string;
  practice?: boolean;
  style?: React.CSSProperties;
}) {
  const p = chipPalette[value] ?? chipPalette[1];
  return (
    <span
      className={cn("chip-face relative inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={
        {
          ...style,
          width: size,
          height: size,
          "--chip-color": p.color,
          "--chip-edge": practice ? "#a2a59f" : p.edge,
          color: p.ink,
          fontSize: Math.max(9, size * 0.3),
        } as React.CSSProperties
      }
      aria-label={label ?? `${value} chip`}
    >
      <span
        className="absolute rounded-full"
        style={{ inset: size * 0.2, border: `1px dashed ${p.ink}`, opacity: 0.45 }}
        aria-hidden
      />
      <span className="relative font-semibold tnum" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </span>
    </span>
  );
}

/** A stack of identical chips, offset vertically. */
export function ChipStack({ value, count, size = 36, className }: { value: number; count: number; size?: number; className?: string }) {
  const n = Math.min(count, 6);
  return (
    <span className={cn("relative inline-block", className)} style={{ width: size, height: size + (n - 1) * 3 }} aria-label={`${count} × ${value} chips`}>
      {Array.from({ length: n }).map((_, i) => (
        <Chip key={i} value={value} size={size} className="absolute left-0" style={{ bottom: i * 3 }} />
      ))}
    </span>
  );
}
