"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSyncExternalStore } from "react";

/**
 * Responsible-play controls. Everything here is player-set and persisted in
 * the browser under the key "responsible-play". Limits that *loosen* play
 * (raising a limit, lifting a lock) wait 24 hours; limits that tighten play
 * apply immediately. Self-exclusion and cooldowns cannot be cut short.
 */

export const SESSION_REMINDER_OPTIONS = [30, 60, 120] as const;
export const COOLDOWN_OPTIONS = [
  { label: "15 minutes", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 60 * 24 },
] as const;
export const SELF_EXCLUSION_OPTIONS = [7, 30, 180] as const;
export const TIME_LIMIT_OPTIONS = [30, 60, 120, 240] as const;

export const LOOSEN_DELAY_MS = 24 * 60 * 60 * 1000;

export type SessionReminderMinutes = (typeof SESSION_REMINDER_OPTIONS)[number];
export type SelfExclusionDays = (typeof SELF_EXCLUSION_OPTIONS)[number];
export type LimitPeriod = "daily" | "weekly";

export interface MoneyLimit {
  amount: number;
  period: LimitPeriod;
}

export interface PendingLimit extends MoneyLimit {
  /** Timestamp at which the looser limit becomes effective. */
  effectiveAt: number;
}

export interface ResponsibleState {
  sessionReminderMinutes: SessionReminderMinutes | null;
  cooldownUntil: number | null;
  selfExclusionUntil: number | null;
  selfExclusionDays: SelfExclusionDays | null;
  depositLimit: MoneyLimit | null;
  pendingDepositLimit: PendingLimit | null;
  lossLimit: MoneyLimit | null;
  pendingLossLimit: PendingLimit | null;
  /** Minutes of play allowed per calendar day. */
  dailyTimeLimitMinutes: number | null;
  accountLocked: boolean;
  /** When set, the lock lifts at this time (24h after the unlock request). */
  unlockAt: number | null;

  setSessionReminder: (minutes: SessionReminderMinutes | null) => void;
  startCooldown: (minutes: number) => void;
  setSelfExclusion: (days: SelfExclusionDays) => void;
  setDepositLimit: (limit: MoneyLimit | null) => void;
  setLossLimit: (limit: MoneyLimit | null) => void;
  setDailyTimeLimit: (minutes: number | null) => void;
  lockAccount: () => void;
  requestUnlock: () => void;
  cancelUnlock: () => void;
  /** Applies any pending limit whose effective time has passed. */
  settle: () => void;
}

/** Tightening applies now; loosening waits LOOSEN_DELAY_MS. */
function isTightening(current: MoneyLimit | null, next: MoneyLimit | null): boolean {
  if (next === null) return false; // removing a limit is loosening
  if (current === null) return true; // adding a limit is tightening
  const perDay = (l: MoneyLimit) => (l.period === "daily" ? l.amount : l.amount / 7);
  return perDay(next) <= perDay(current);
}

export const useResponsibleStore = create<ResponsibleState>()(
  persist(
    (set, get) => ({
      sessionReminderMinutes: null,
      cooldownUntil: null,
      selfExclusionUntil: null,
      selfExclusionDays: null,
      depositLimit: null,
      pendingDepositLimit: null,
      lossLimit: null,
      pendingLossLimit: null,
      dailyTimeLimitMinutes: null,
      accountLocked: false,
      unlockAt: null,

      setSessionReminder: (sessionReminderMinutes) => set({ sessionReminderMinutes }),

      startCooldown: (minutes) => {
        const until = Date.now() + minutes * 60_000;
        const current = get().cooldownUntil ?? 0;
        // A cooldown can be extended, never shortened.
        set({ cooldownUntil: Math.max(current, until) });
      },

      setSelfExclusion: (days) => {
        const until = Date.now() + days * 24 * 60 * 60 * 1000;
        const current = get().selfExclusionUntil ?? 0;
        set({ selfExclusionUntil: Math.max(current, until), selfExclusionDays: days });
      },

      setDepositLimit: (next) => {
        const { depositLimit } = get();
        if (isTightening(depositLimit, next)) set({ depositLimit: next, pendingDepositLimit: null });
        else if (next === null) set({ pendingDepositLimit: { amount: 0, period: depositLimit?.period ?? "daily", effectiveAt: Date.now() + LOOSEN_DELAY_MS } });
        else set({ pendingDepositLimit: { ...next, effectiveAt: Date.now() + LOOSEN_DELAY_MS } });
      },

      setLossLimit: (next) => {
        const { lossLimit } = get();
        if (isTightening(lossLimit, next)) set({ lossLimit: next, pendingLossLimit: null });
        else if (next === null) set({ pendingLossLimit: { amount: 0, period: lossLimit?.period ?? "daily", effectiveAt: Date.now() + LOOSEN_DELAY_MS } });
        else set({ pendingLossLimit: { ...next, effectiveAt: Date.now() + LOOSEN_DELAY_MS } });
      },

      setDailyTimeLimit: (dailyTimeLimitMinutes) => set({ dailyTimeLimitMinutes }),

      lockAccount: () => set({ accountLocked: true, unlockAt: null }),
      requestUnlock: () => set({ unlockAt: Date.now() + LOOSEN_DELAY_MS }),
      cancelUnlock: () => set({ unlockAt: null }),

      settle: () => {
        const s = get();
        const now = Date.now();
        const patch: Partial<ResponsibleState> = {};
        if (s.pendingDepositLimit && s.pendingDepositLimit.effectiveAt <= now) {
          const { amount, period } = s.pendingDepositLimit;
          patch.depositLimit = amount > 0 ? { amount, period } : null;
          patch.pendingDepositLimit = null;
        }
        if (s.pendingLossLimit && s.pendingLossLimit.effectiveAt <= now) {
          const { amount, period } = s.pendingLossLimit;
          patch.lossLimit = amount > 0 ? { amount, period } : null;
          patch.pendingLossLimit = null;
        }
        if (s.accountLocked && s.unlockAt !== null && s.unlockAt <= now) {
          patch.accountLocked = false;
          patch.unlockAt = null;
        }
        if (s.cooldownUntil !== null && s.cooldownUntil <= now) patch.cooldownUntil = null;
        if (s.selfExclusionUntil !== null && s.selfExclusionUntil <= now) {
          patch.selfExclusionUntil = null;
          patch.selfExclusionDays = null;
        }
        if (Object.keys(patch).length) set(patch);
      },
    }),
    {
      name: "responsible-play",
      partialize: (s) => ({
        sessionReminderMinutes: s.sessionReminderMinutes,
        cooldownUntil: s.cooldownUntil,
        selfExclusionUntil: s.selfExclusionUntil,
        selfExclusionDays: s.selfExclusionDays,
        depositLimit: s.depositLimit,
        pendingDepositLimit: s.pendingDepositLimit,
        lossLimit: s.lossLimit,
        pendingLossLimit: s.pendingLossLimit,
        dailyTimeLimitMinutes: s.dailyTimeLimitMinutes,
        accountLocked: s.accountLocked,
        unlockAt: s.unlockAt,
      }),
    },
  ),
);

/* ------------------------------------------------------------------
   Hydration (persist rehydrates on the client; avoid SSR mismatches)
------------------------------------------------------------------ */
function subscribeHydration(cb: () => void) {
  const unsub = useResponsibleStore.persist.onFinishHydration(cb);
  return unsub;
}
export function useResponsibleHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    () => useResponsibleStore.persist.hasHydrated(),
    () => false,
  );
}

/* ------------------------------------------------------------------
   Daily play-time ledger (localStorage, maintained by useSessionReminder)
------------------------------------------------------------------ */
export const PLAYTIME_KEY = "responsible-play:playtime";

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readPlayedTodayMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(PLAYTIME_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day?: string; ms?: number };
    return parsed.day === todayKey() && typeof parsed.ms === "number" ? parsed.ms : 0;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------
   Gate
------------------------------------------------------------------ */
export interface ResponsibleGate {
  blocked: boolean;
  reason?: string;
  /** Timestamp the block lifts, when known. */
  until?: number;
}

export function evaluateGate(
  s: Pick<ResponsibleState, "accountLocked" | "unlockAt" | "selfExclusionUntil" | "cooldownUntil" | "dailyTimeLimitMinutes">,
  playedTodayMs: number,
  now = Date.now(),
): ResponsibleGate {
  if (s.selfExclusionUntil !== null && s.selfExclusionUntil > now) {
    return { blocked: true, reason: "Self-exclusion is active.", until: s.selfExclusionUntil };
  }
  if (s.accountLocked && (s.unlockAt === null || s.unlockAt > now)) {
    return { blocked: true, reason: "Your account is locked.", until: s.unlockAt ?? undefined };
  }
  if (s.cooldownUntil !== null && s.cooldownUntil > now) {
    return { blocked: true, reason: "A cooldown is in progress.", until: s.cooldownUntil };
  }
  if (s.dailyTimeLimitMinutes !== null && playedTodayMs >= s.dailyTimeLimitMinutes * 60_000) {
    return { blocked: true, reason: "You have reached today's time limit." };
  }
  return { blocked: false };
}

/**
 * Lightweight hook other pages can call before showing real-money UI.
 * Returns `{ blocked: false }` until the store has hydrated, so server render
 * and first client render agree; consumers should also respect the server-side
 * jurisdiction gate in `@/config/jurisdictions`.
 */
export function useResponsibleGate(): ResponsibleGate {
  const hydrated = useResponsibleHydrated();
  const accountLocked = useResponsibleStore((s) => s.accountLocked);
  const unlockAt = useResponsibleStore((s) => s.unlockAt);
  const selfExclusionUntil = useResponsibleStore((s) => s.selfExclusionUntil);
  const cooldownUntil = useResponsibleStore((s) => s.cooldownUntil);
  const dailyTimeLimitMinutes = useResponsibleStore((s) => s.dailyTimeLimitMinutes);
  if (!hydrated) return { blocked: false };
  return evaluateGate(
    { accountLocked, unlockAt, selfExclusionUntil, cooldownUntil, dailyTimeLimitMinutes },
    readPlayedTodayMs(),
  );
}
