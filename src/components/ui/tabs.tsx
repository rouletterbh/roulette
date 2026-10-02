"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * WAI-ARIA tabs with roving tabindex. Arrow keys move focus and selection,
 * Home/End jump. Panels are rendered by the caller using `panelProps(id)`.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  variant = "underline",
  layoutKey,
}: {
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  variant?: "underline" | "pill";
  /** Unique per instance so motion layout ids never collide. */
  layoutKey?: string;
}) {
  const uid = useId();
  const key = layoutKey ?? uid;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduce = useReducedMotion();

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = tabs.length;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % n;
    else if (e.key === "ArrowLeft") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "no-scrollbar flex snap-x gap-1 overflow-x-auto",
        variant === "underline" && "hairline-b",
        variant === "pill" && "rounded-full border border-border bg-surface p-1 dark:bg-elevated",
        className,
      )}
    >
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${key}-tab-${t.id}`}
            aria-selected={active}
            aria-controls={`${key}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative shrink-0 snap-start whitespace-nowrap text-[13px] font-medium transition-colors",
              variant === "underline" && "px-1 py-3 tracking-[0.12em] uppercase text-[11.5px] mr-5",
              variant === "pill" && "rounded-full px-4 py-1.5",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${key}-indicator`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                className={cn("absolute", variant === "underline" ? "inset-x-0 -bottom-px h-px bg-ink" : "inset-0 rounded-full bg-sunken dark:bg-surface")}
                aria-hidden
              />
            )}
            <span className="relative">
              {t.label}
              {typeof t.count === "number" && <span className="ml-1.5 text-[11px] tnum text-muted">{t.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel<T extends string>({
  id,
  value,
  layoutKey,
  children,
  className,
}: {
  id: T;
  value: T;
  layoutKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (id !== value) return null;
  return (
    <div role="tabpanel" id={`${layoutKey}-panel-${id}`} aria-labelledby={`${layoutKey}-tab-${id}`} tabIndex={0} className={cn("outline-none", className)}>
      {children}
    </div>
  );
}
