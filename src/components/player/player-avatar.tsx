import { cn } from "@/lib/utils";

/** Deterministic generative avatar from a wallet address. No external images. */
export function PlayerAvatar({ address, size = 32, className, name }: { address: string; size?: number; className?: string; name?: string }) {
  const h = hash(address);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 80)) % 360;
  const rot = h % 180;
  return (
    <span
      className={cn("inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from ${rot}deg, hsl(${hue} 70% 55%), hsl(${hue2} 80% 45%), hsl(${hue} 70% 55%))`,
      }}
      aria-label={name ? `${name} avatar` : "player avatar"}
      role="img"
    >
      <span className="block h-full w-full" style={{ background: `radial-gradient(circle at ${30 + (h % 40)}% ${30 + ((h >> 3) % 40)}%, rgba(255,255,255,0.55), transparent 55%)` }} />
    </span>
  );
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
