"use client";

import { motion, useReducedMotion } from "motion/react";
import { rarityLabel, type Achievement } from "@/config/achievements";
import { cn } from "@/lib/utils";

const sizes = {
  sm: { outer: 48, icon: 20 },
  md: { outer: 72, icon: 28 },
  lg: { outer: 104, icon: 40 },
} as const;

/**
 * Collectible medallion. Earned badges are embossed (inset highlight + shadow)
 * with a hairline ring; locked badges are a dashed outline with the icon
 * ghosted. State is also carried in text (sr-only / label), never color alone.
 */
export function AchievementBadge({
  achievement,
  earned,
  size = "md",
  earnedAt,
  showLabel = false,
  className,
}: {
  achievement: Achievement;
  earned: boolean;
  size?: keyof typeof sizes;
  /** Pre-formatted date; shown under the label when provided. */
  earnedAt?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const s = sizes[size];
  const Icon = achievement.icon;
  const title = `${achievement.name} — ${earned ? "earned" : "locked"}. ${achievement.description}`;

  return (
    <motion.div
      whileHover={reduce ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn("group/badge inline-flex flex-col items-center text-center", showLabel ? "w-[7.5rem]" : "", className)}
      title={title}
      data-earned={earned ? "true" : "false"}
    >
      <span
        role="img"
        aria-label={title}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full transition-shadow duration-300",
          earned
            ? "bg-surface text-ink ring-1 ring-border dark:bg-elevated group-hover/badge:shadow-md"
            : "border border-dashed border-border bg-transparent text-faint",
        )}
        style={{
          width: s.outer,
          height: s.outer,
          boxShadow: earned
            ? "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 4px rgba(8,10,8,0.08), inset 0 0 0 3px var(--canvas), inset 0 0 0 4px var(--hairline)"
            : undefined,
        }}
      >
        <Icon size={s.icon} />
        {earned && (
          <span className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover/badge:opacity-100" aria-hidden style={{ boxShadow: "0 0 0 1px var(--border-strong)" }} />
        )}
      </span>
      {showLabel && (
        <span className="mt-3 block">
          <span className={cn("block text-[13px] font-medium leading-tight", earned ? "text-ink" : "text-muted")}>{achievement.name}</span>
          <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-faint">
            {earned ? (earnedAt ?? rarityLabel[achievement.rarity]) : "Locked"}
          </span>
        </span>
      )}
    </motion.div>
  );
}
