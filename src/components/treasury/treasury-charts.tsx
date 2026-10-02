"use client";

import { useState } from "react";
import { cn, formatUsd } from "@/lib/utils";

/**
 * Charts follow the dataviz method: fixed categorical order, validated palette
 * (reference steps for light and dark), 2px surface gaps, legend + direct values,
 * hover tooltips, text in text tokens.
 */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

export function AllocationBar({ parts, total }: { parts: Array<{ label: string; value: number }>; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="viz-root">
      <style>{`.viz-root{${SERIES.map((c, i) => `--series-${i + 1}:${c};`).join("")}} :root[data-theme="dark"] .viz-root{${SERIES_DARK.map((c, i) => `--series-${i + 1}:${c};`).join("")}}`}</style>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden" role="img" aria-label={parts.map((p) => `${p.label} ${formatUsd(p.value)}`).join(", ")}>
        {parts.map((p, i) => (
          <div
            key={p.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cn("relative h-full transition-opacity", hover != null && hover !== i && "opacity-50")}
            style={{ width: `${(p.value / total) * 100}%`, background: `var(--series-${i + 1})`, minWidth: p.value > 0 ? 3 : 0 }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2 md:grid-cols-5" aria-label="Legend">
        {parts.map((p, i) => (
          <li key={p.label} className={cn("flex items-center gap-2", hover != null && hover !== i && "opacity-60")} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(--series-${i + 1})` }} aria-hidden />
            <span className="text-muted">{p.label}</span>
            <span className="ml-auto font-mono text-[12px] tnum text-ink">{formatUsd(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PayoutBars({ data }: { data: Array<{ day: string; payouts: number; wagers: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => Math.max(d.payouts, d.wagers)), 1);
  const W = 720;
  const H = 180;
  const padL = 36;
  const padB = 22;
  const innerW = W - padL - 8;
  const innerH = H - padB - 8;
  const slot = innerW / data.length;
  const bw = Math.max(3, slot * 0.3);
  const y = (v: number) => 8 + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  return (
    <div className="viz-root relative">
      <style>{`.viz-root{--series-1:${SERIES[0]};--series-2:${SERIES[1]};} :root[data-theme="dark"] .viz-root{--series-1:${SERIES_DARK[0]};--series-2:${SERIES_DARK[1]};}`}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily wagers and payouts, last 30 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{formatUsd(t, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = padL + i * slot + slot / 2;
          const active = hover === i;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={8} width={slot} height={innerH} fill="transparent" />
              <rect x={x0 - bw - 1} y={y(d.wagers)} width={bw} height={innerH + 8 - y(d.wagers)} rx="0" fill="var(--series-1)" opacity={hover == null || active ? 1 : 0.45} />
              <rect x={x0 + 1} y={y(d.payouts)} width={bw} height={innerH + 8 - y(d.payouts)} rx="0" fill="var(--series-2)" opacity={hover == null || active ? 1 : 0.45} />
              {(i === 0 || i === data.length - 1 || (i % 7 === 0 && i < data.length - 3)) && (
                <text x={x0} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{d.day}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 border border-border bg-surface px-3 py-2 font-mono text-[11.5px] dark:bg-elevated" role="tooltip">
          <div className="microlabel">{data[hover].day}</div>
          <div className="flex gap-4 tnum"><span><span className="mr-1 inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--series-1)" }} />Wagers {formatUsd(data[hover].wagers)}</span><span><span className="mr-1 inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--series-2)" }} />Payouts {formatUsd(data[hover].payouts)}</span></div>
        </div>
      )}
      <ul className="mt-2 flex gap-5 microlabel" aria-label="Legend">
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--series-1)" }} aria-hidden />Wagers</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--series-2)" }} aria-hidden />Payouts</li>
      </ul>
    </div>
  );
}
