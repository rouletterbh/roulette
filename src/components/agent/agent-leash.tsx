import { cn } from "@/lib/utils";

export interface LeashUsage {
  chips: number; chipsMax: number;
  loss: number; lossMax: number;
  rounds: number; roundsMax: number;
  minutes: number; minutesMax: number;
}

const ARCS: Array<{ key: "chips" | "loss" | "rounds" | "minutes"; label: string; unit: string }> = [
  { key: "chips", label: "Chips", unit: "" },
  { key: "loss", label: "Loss", unit: "" },
  { key: "rounds", label: "Rounds", unit: "" },
  { key: "minutes", label: "Time", unit: "m" },
];

/**
 * AgentLeash: four concentric arcs (chips · loss · rounds · time). Amber past
 * 80%, black when reached. Precise instrumentation, not a progress bar.
 */
export function AgentLeash({ usage, size = 160, compact, className, triggered }: { usage: LeashUsage; size?: number; compact?: boolean; className?: string; triggered?: string | null }) {
  const c = size / 2;
  const stroke = compact ? 3 : 4;
  const gap = compact ? 5 : 7;
  const r0 = c - stroke;
  const arcs = ARCS.map((a, i) => {
    const max = usage[`${a.key}Max` as keyof LeashUsage] as number;
    const v = usage[a.key] as number;
    const frac = max > 0 ? Math.min(1, v / max) : 0;
    const r = r0 - i * (stroke + gap);
    const circ = 2 * Math.PI * r;
    const color = frac >= 1 ? "var(--agent-stopped)" : frac >= 0.8 ? "var(--agent-warn)" : "var(--ink)";
    return { ...a, v, max, frac, r, circ, color };
  });
  return (
    <div className={cn("flex items-center gap-5", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" role="img" aria-label={arcs.map((a) => `${a.label} ${a.v} of ${a.max}${a.unit}`).join(", ")}>
        {arcs.map((a) => (
          <g key={a.key}>
            <circle cx={c} cy={c} r={a.r} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
            <circle cx={c} cy={c} r={a.r} fill="none" stroke={a.color} strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={a.circ} strokeDashoffset={a.circ * (1 - a.frac)} style={{ transition: "stroke-dashoffset 600ms var(--ease-out-expo), stroke 300ms" }} />
          </g>
        ))}
        {Array.from({ length: 36 }).map((_, i) => {
          const ang = (i / 36) * Math.PI * 2;
          return <line key={i} x1={c + (r0 + 1) * Math.cos(ang)} y1={c + (r0 + 1) * Math.sin(ang)} x2={c + (r0 + (i % 9 === 0 ? 4 : 2)) * Math.cos(ang)} y2={c + (r0 + (i % 9 === 0 ? 4 : 2)) * Math.sin(ang)} stroke="var(--border-strong)" strokeWidth="0.8" />;
        })}
      </svg>
      {!compact && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
          {arcs.map((a) => (
            <div key={a.key}>
              <dt className="microlabel flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: a.color }} />{a.label}</dt>
              <dd className="font-mono text-[13px] tnum" style={{ color: a.frac >= 1 ? "var(--agent-stopped)" : a.frac >= 0.8 ? "var(--agent-warn)" : undefined }}>{Math.round(a.v)} <span className="text-faint">/ {a.max}{a.unit}</span></dd>
            </div>
          ))}
          {triggered && <div className="col-span-2 border-t border-hairline pt-2 microlabel !text-ink">Leash triggered · {triggered}</div>}
        </dl>
      )}
    </div>
  );
}
