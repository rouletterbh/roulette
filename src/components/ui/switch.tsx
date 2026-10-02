"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible switch (role="switch"). The label is always rendered as text so
 * state is never communicated by color alone; the knob also moves position.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  tone = "neutral",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  /** "accent" = active state is a positive/live thing; "red" = a pause/halt. */
  tone?: "neutral" | "accent" | "red";
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const on = tone === "red" ? "bg-casino-red" : tone === "accent" ? "bg-accent" : "bg-ink";
  const knobOn = tone === "accent" ? "bg-accent-ink" : "bg-canvas";
  return (
    <div className={cn("flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-[14.5px] font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-[3px] transition-colors disabled:opacity-40",
          checked ? cn(on, "border-transparent") : "border-border bg-surface hover:border-border-strong dark:bg-elevated",
        )}
      >
        <motion.span
          layout
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }}
          className={cn("block h-5 w-5 rounded-full", checked ? cn(knobOn, "ml-auto") : "bg-ink")}
          aria-hidden
        />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
