import { glyphMotion, stateColorVar, type AgentState } from "@/lib/agent/states";
import { hashString } from "@/lib/demo/prng";
import { cn } from "@/lib/utils";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * AgentGlyph: a unique, abstract machine mark per agent (rings, ticks, orbiting
 * nodes, spokes) whose motion encodes its state. No faces, no robots.
 */
export function AgentGlyph({ seed, state = "observing", size = 40, className, title }: { seed: string; state?: AgentState; size?: number; className?: string; title?: string }) {
  const h = hashString(seed);
  const spokes = 6 + (h % 7); // 6..12
  const ticks = 12 + ((h >>> 4) % 25); // 12..36
  const nodes = 2 + ((h >>> 9) % 4); // 2..5
  const innerR = 9 + ((h >>> 13) % 6);
  const rot = (h >>> 18) % 360;
  const color = stateColorVar(state);
  const motion = glyphMotion(state);
  const accent = state === "executing" || state === "locked" || state === "collected";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn(`glyph-${motion}`, "shrink-0", className)} role="img" aria-label={title ?? `Agent glyph, ${state}`}>
      <g className="g-outer" style={{ transform: `rotate(${rot}deg)` }}>
        <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.9" />
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * Math.PI * 2;
          const long = i % 3 === 0;
          const r1 = long ? 26 : 28;
          return <line key={i} x1={r2(32 + r1 * Math.cos(a))} y1={r2(32 + r1 * Math.sin(a))} x2={r2(32 + 30 * Math.cos(a))} y2={r2(32 + 30 * Math.sin(a))} stroke="currentColor" strokeWidth={long ? 1.2 : 0.7} opacity={long ? 0.9 : 0.5} />;
        })}
        <circle className="g-scan" cx="32" cy="32" r="30" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="40 180" strokeLinecap="round" opacity={motion === "observing" ? 1 : 0} />
      </g>
      <g className="g-sweep" opacity={motion === "executing" ? 1 : 0}>
        <path d="M32 32 L32 4 A28 28 0 0 1 56 20 Z" fill={color} opacity="0.22" />
      </g>
      <g className="g-inner">
        <circle cx="32" cy="32" r={innerR + 6} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
        {Array.from({ length: spokes }).map((_, i) => {
          const a = (i / spokes) * Math.PI * 2;
          return <line key={i} x1={r2(32 + (innerR - 2) * Math.cos(a))} y1={r2(32 + (innerR - 2) * Math.sin(a))} x2={r2(32 + (innerR + 6) * Math.cos(a))} y2={r2(32 + (innerR + 6) * Math.sin(a))} stroke="currentColor" strokeWidth="0.9" opacity="0.7" />;
        })}
        <circle cx="32" cy="32" r={innerR - 3} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="32" cy="32" r="2.2" fill={accent ? color : "currentColor"} />
      </g>
      {Array.from({ length: nodes }).map((_, i) => {
        const a = ((i / nodes) * Math.PI * 2) + (rot * Math.PI) / 180;
        const r = 20;
        return <circle key={i} className="g-node" cx={r2(32 + r * Math.cos(a))} cy={r2(32 + r * Math.sin(a))} r={i === 0 ? 2.4 : 1.6} fill={i === 0 ? color : "currentColor"} opacity={i === 0 ? 1 : 0.6} style={{ animationDelay: `${i * 0.18}s` }} />;
      })}
    </svg>
  );
}
