"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { colorOf } from "@/lib/roulette/constants";
import { OUTSIDE_BETS, betFromId, split, corner, street, sixLine, straight } from "@/lib/roulette/bets";
import { Chip, chipPalette } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

export interface RouletteBoardProps {
  bets: Record<string, number>;
  onBet: (betId: string) => void;
  onRemove?: (betId: string) => void;
  disabled?: boolean;
  /** Vertical layout for phones: 3 columns tall. */
  vertical?: boolean;
  winning?: number | null;
  className?: string;
  practice?: boolean;
  /** Bet id to highlight from outside (e.g. hovering an agent's bet in the rail). */
  externalHighlight?: string | null;
}

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);

function chipValueColor(stake: number) {
  const denoms = Object.keys(chipPalette).map(Number).sort((a, b) => b - a);
  return denoms.find((d) => d <= stake) ?? 1;
}

export function RouletteBoard({ bets, onBet, onRemove, disabled, vertical = false, winning = null, className, practice, externalHighlight = null }: RouletteBoardProps) {
  const [innerHover, setHover] = useState<string | null>(null);
  const hover = innerHover ?? externalHighlight;
  const hoverSet = useMemo(() => new Set(hover ? betFromId(hover)?.numbers ?? [] : []), [hover]);

  const cellPos = (n: number): CSSProperties => {
    const r = Math.ceil(n / 3);
    const m = n % 3;
    return vertical
      ? { gridRow: r + 1, gridColumn: m === 1 ? 3 : m === 2 ? 4 : 5 }
      : { gridColumn: r + 1, gridRow: m === 0 ? 1 : m === 2 ? 2 : 3 };
  };

  const zones = (n: number) => {
    const m = n % 3;
    const r = Math.ceil(n / 3);
    const z: Array<{ id: string; style: CSSProperties; label: string }> = [];
    const pos = (h: "left" | "right" | "center", v: "top" | "bottom" | "center"): CSSProperties => ({
      left: h === "left" ? 0 : h === "right" ? "100%" : "50%",
      top: v === "top" ? 0 : v === "bottom" ? "100%" : "50%",
    });
    if (!vertical) {
      if (n + 3 <= 36) z.push({ id: split(n, n + 3).id, style: pos("right", "center"), label: `Split ${n}/${n + 3}` });
      if (m !== 0) z.push({ id: split(n, n + 1).id, style: pos("center", "top"), label: `Split ${n}/${n + 1}` });
      if (m !== 0 && n + 4 <= 36) z.push({ id: corner(n).id, style: pos("right", "top"), label: `Corner ${n}/${n + 1}/${n + 3}/${n + 4}` });
      if (m === 1) z.push({ id: street(r).id, style: pos("center", "bottom"), label: `Street ${n}–${n + 2}` });
      if (m === 1 && n + 3 <= 36) z.push({ id: sixLine(r).id, style: pos("right", "bottom"), label: `Six line ${n}–${n + 5}` });
    } else {
      if (n + 3 <= 36) z.push({ id: split(n, n + 3).id, style: pos("center", "bottom"), label: `Split ${n}/${n + 3}` });
      if (m !== 0) z.push({ id: split(n, n + 1).id, style: pos("right", "center"), label: `Split ${n}/${n + 1}` });
      if (m !== 0 && n + 4 <= 36) z.push({ id: corner(n).id, style: pos("right", "bottom"), label: `Corner ${n}/${n + 1}/${n + 3}/${n + 4}` });
      if (m === 1) z.push({ id: street(r).id, style: pos("left", "center"), label: `Street ${n}–${n + 2}` });
      if (m === 1 && n + 3 <= 36) z.push({ id: sixLine(r).id, style: pos("left", "bottom"), label: `Six line ${n}–${n + 5}` });
    }
    return z;
  };

  const handle = (id: string) => {
    if (disabled) return;
    onBet(id);
  };
  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (disabled || !bets[id]) return;
    onRemove?.(id);
  };

  const stakeChip = (id: string, size = 26) =>
    bets[id] ? (
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]">
        <Chip value={bets[id]} size={size} practice={practice} style={{ ["--chip-color" as string]: chipPalette[chipValueColor(bets[id])].color, color: chipPalette[chipValueColor(bets[id])].ink }} />
      </span>
    ) : null;

  const cellBase =
    "relative flex items-center justify-center rounded-[6px] border text-[14px] font-medium tnum transition-[background-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent";

  const numberCell = (n: number) => {
    const c = colorOf(n);
    const hot = hoverSet.has(n);
    const isWin = winning === n;
    return (
      <div key={n} className="relative" style={cellPos(n)}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handle(straight(n).id)}
          onContextMenu={(e) => handleRemove(e, straight(n).id)}
          onMouseEnter={() => setHover(straight(n).id)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(straight(n).id)}
          onBlur={() => setHover(null)}
          aria-label={`${n} ${c}, straight up`}
          className={cn(
            cellBase,
            "h-full w-full",
            c === "red" && "border-casino-red/60 bg-casino-red text-white",
            c === "black" && "border-black/40 bg-roulette-black text-white",
            hot && "ring-2 ring-accent ring-inset brightness-110",
            isWin && "win-pulse ring-2 ring-accent",
            disabled && "cursor-default",
          )}
        >
          <span className="flex flex-col items-center leading-none">
            {n}
            <span className="mt-0.5 text-[8px] uppercase tracking-[0.1em] opacity-60" aria-hidden>{c === "red" ? "R" : "B"}</span>
          </span>
          {stakeChip(straight(n).id)}
        </button>
        {zones(n).map((z) => (
          <button
            key={z.id}
            type="button"
            disabled={disabled}
            aria-label={z.label}
            onClick={() => handle(z.id)}
            onContextMenu={(e) => handleRemove(e, z.id)}
            onMouseEnter={() => setHover(z.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(z.id)}
            onBlur={() => setHover(null)}
            className={cn(
              "absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-[background-color] focus-visible:ring-2 focus-visible:ring-accent",
              hover === z.id ? "bg-accent/80" : "bg-transparent hover:bg-accent/60",
            )}
            style={z.style}
          >
            {stakeChip(z.id, 22)}
          </button>
        ))}
      </div>
    );
  };

  const outsideCell = (id: string, label: React.ReactNode, style: CSSProperties, extra?: string) => {
    const def = OUTSIDE_BETS[id];
    const hot = hover === id;
    return (
      <button
        key={id}
        type="button"
        disabled={disabled}
        onClick={() => handle(id)}
        onContextMenu={(e) => handleRemove(e, id)}
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(id)}
        onBlur={() => setHover(null)}
        aria-label={`${def.label}, pays ${def.multiplier} to 1`}
        className={cn(
          cellBase,
          "border-border bg-surface text-ink hover:bg-sunken dark:bg-elevated dark:hover:bg-surface",
          hot && "ring-2 ring-accent ring-inset",
          winning != null && def.numbers.includes(winning) && "ring-2 ring-accent",
          extra,
        )}
        style={style}
      >
        {label}
        {stakeChip(id)}
      </button>
    );
  };

  const gridStyle: CSSProperties = vertical
    ? { gridTemplateColumns: "1.1fr 0.9fr repeat(3, 1.6fr)", gridTemplateRows: "repeat(14, minmax(40px, 1fr))" }
    : { gridTemplateColumns: "1.2fr repeat(12, 1fr) 1.2fr", gridTemplateRows: "repeat(3, minmax(44px, 1fr)) 40px 40px" };

  const colorSwatch = (c: "red" | "black") => (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[3px]", c === "red" ? "bg-casino-red" : "bg-roulette-black")} aria-hidden />
      <span className={cn(vertical && "sr-only")}>{c === "red" ? "Red" : "Black"}</span>
    </span>
  );

  return (
    <div className={cn("grid w-full gap-1", className)} style={gridStyle} role="group" aria-label="Roulette betting board">
      {/* zero */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => handle("straight:0")}
        onContextMenu={(e) => handleRemove(e, "straight:0")}
        onMouseEnter={() => setHover("straight:0")}
        onMouseLeave={() => setHover(null)}
        aria-label="0 green, straight up"
        className={cn(cellBase, "border-roulette-green/60 bg-roulette-green text-white", hoverSet.has(0) && "ring-2 ring-accent ring-inset", winning === 0 && "win-pulse ring-2 ring-accent")}
        style={vertical ? { gridRow: 1, gridColumn: "3 / span 3" } : { gridColumn: 1, gridRow: "1 / span 3" }}
      >
        0{stakeChip("straight:0")}
      </button>

      {NUMBERS.map(numberCell)}

      {/* column bets */}
      {[3, 2, 1].map((col, i) =>
        outsideCell(
          `column:${col}`,
          <span className="text-[11px]">2:1</span>,
          vertical ? { gridRow: 14, gridColumn: 2 + col } : { gridColumn: 14, gridRow: i + 1 },
        ),
      )}

      {/* dozens */}
      {[1, 2, 3].map((d) =>
        outsideCell(
          `dozen:${d}`,
          <span className={cn("text-[12px]", vertical && "[writing-mode:vertical-rl] rotate-180")}>{d === 1 ? "1st 12" : d === 2 ? "2nd 12" : "3rd 12"}</span>,
          vertical ? { gridColumn: 2, gridRow: `${2 + (d - 1) * 4} / span 4` } : { gridRow: 4, gridColumn: `${2 + (d - 1) * 4} / span 4` },
        ),
      )}

      {/* even-money */}
      {(
        [
          ["low", "1–18"],
          ["even", "Even"],
          ["red", colorSwatch("red")],
          ["black", colorSwatch("black")],
          ["odd", "Odd"],
          ["high", "19–36"],
        ] as Array<[string, React.ReactNode]>
      ).map(([id, label], i) =>
        outsideCell(
          id,
          <span className={cn("text-[12px]", vertical && typeof label === "string" && "[writing-mode:vertical-rl] rotate-180")}>{label}</span>,
          vertical ? { gridColumn: 1, gridRow: `${2 + i * 2} / span 2` } : { gridRow: 5, gridColumn: `${2 + i * 2} / span 2` },
        ),
      )}
    </div>
  );
}
