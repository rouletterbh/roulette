"use client";

import { motion } from "motion/react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

const QUICK = [1, 5, 10, 25, 50];

export function ChipSelector({
  value,
  onChange,
  onClear,
  onUndo,
  onRepeat,
  onDouble,
  onMaxSafe,
  disabled,
  canUndo,
  canRepeat,
  hasBets,
  practice,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onRepeat: () => void;
  onDouble: () => void;
  onMaxSafe: () => void;
  disabled?: boolean;
  canUndo?: boolean;
  canRepeat?: boolean;
  hasBets?: boolean;
  practice?: boolean;
  className?: string;
}) {
  const action = (label: string, onClick: () => void, enabled: boolean, title?: string) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      disabled={disabled || !enabled}
      title={title}
      className="h-9 rounded-full border border-border px-3.5 text-[12px] font-medium uppercase tracking-[0.08em] transition-colors hover:border-ink disabled:opacity-35 disabled:hover:border-border"
    >
      {label}
    </button>
  );

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Chip value">
        {QUICK.map((v) => {
          const selected = v === value;
          return (
            <motion.button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(v)}
              whileTap={{ scale: 0.92 }}
              animate={{ y: selected ? -6 : 0, scale: selected ? 1.08 : 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas", selected && "drop-shadow-[0_6px_10px_rgba(0,0,0,0.3)]")}
            >
              <Chip value={v} size={44} practice={practice} />
            </motion.button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {action("Clear", onClear, !!hasBets)}
        {action("Undo", onUndo, !!canUndo)}
        {action("Repeat", onRepeat, !!canRepeat, "Repeat last round's bets")}
        {action("Double", onDouble, !!hasBets)}
        {action("Max safe", onMaxSafe, !!hasBets, "Raise the last bet to the maximum the treasury can collateralize")}
      </div>
    </div>
  );
}
