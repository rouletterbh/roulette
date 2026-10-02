"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COOLDOWN_OPTIONS,
  LOOSEN_DELAY_MS,
  SELF_EXCLUSION_OPTIONS,
  SESSION_REMINDER_OPTIONS,
  TIME_LIMIT_OPTIONS,
  evaluateGate,
  useResponsibleHydrated,
  useResponsibleStore,
  type LimitPeriod,
  type MoneyLimit,
  type PendingLimit,
  type SelfExclusionDays,
  type SessionReminderMinutes,
} from "@/store/responsible";
import { useSessionClock, useSessionReminder } from "./use-session-reminder";

export { useResponsibleGate } from "@/store/responsible";
export { useSessionReminder } from "./use-session-reminder";

/* ------------------------------------------------------------------
   Formatting
------------------------------------------------------------------ */
function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m} min`;
}
function fmtMinutes(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} day${min / 1440 === 1 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hour${min / 60 === 1 ? "" : "s"}`;
  return `${min} minutes`;
}
function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(ts);
}
function fmtLimit(l: MoneyLimit): string {
  return `${l.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${l.period === "daily" ? "day" : "week"}`;
}

/* ------------------------------------------------------------------
   Primitives
------------------------------------------------------------------ */
function Row({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="grid gap-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-14">
      <div className="max-w-sm">
        <h3 className="font-display text-3xl leading-none">{title}</h3>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{description}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-4 flex min-h-[22px] flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-ink-2">{status}</div>
        {children}
      </div>
    </li>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 rounded-full border px-4 text-[13px] tnum transition-colors",
              active ? "border-ink bg-ink text-canvas" : "border-border text-ink hover:border-border-strong",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const inputCls =
  "h-10 rounded-full border border-border bg-surface px-4 text-[14px] text-ink outline-none transition-colors placeholder:text-faint hover:border-border-strong focus:border-ink dark:bg-elevated";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border p-[3px] transition-colors",
        checked ? "border-ink bg-ink" : "border-border bg-surface dark:bg-elevated",
      )}
    >
      <span
        className={cn(
          "block h-6 w-6 rounded-full transition-transform duration-200 ease-[var(--ease-out-expo)]",
          checked ? "translate-x-[20px] bg-canvas" : "translate-x-0 bg-ink",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------
   Limit editor (deposit / loss)
------------------------------------------------------------------ */
function LimitEditor({
  label,
  current,
  pending,
  onSave,
}: {
  label: string;
  current: MoneyLimit | null;
  pending: PendingLimit | null;
  onSave: (l: MoneyLimit | null) => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<LimitPeriod>(current?.period ?? "daily");
  const parsed = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({ amount: Math.round(parsed * 100) / 100, period });
        setAmount("");
      }}
    >
      <label htmlFor={`${id}-amount`} className="sr-only">
        {label} amount
      </label>
      <input
        id={`${id}-amount`}
        inputMode="decimal"
        type="number"
        min={1}
        step="1"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={cn(inputCls, "w-32 tnum")}
      />
      <label htmlFor={`${id}-period`} className="sr-only">
        {label} period
      </label>
      <select
        id={`${id}-period`}
        value={period}
        onChange={(e) => setPeriod(e.target.value as LimitPeriod)}
        className={cn(inputCls, "pr-8")}
      >
        <option value="daily">per day</option>
        <option value="weekly">per week</option>
      </select>
      <Button type="submit" size="md" variant="outline" disabled={!valid}>
        Set limit
      </Button>
      {current && !pending && (
        <Button type="button" size="md" variant="ghost" onClick={() => onSave(null)}>
          Remove (24h)
        </Button>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------
   Main
------------------------------------------------------------------ */
export function ResponsibleTools({ className }: { className?: string }) {
  const hydrated = useResponsibleHydrated();
  const s = useResponsibleStore();
  const clock = useSessionClock();
  const reminder = useSessionReminder();
  const reduceMotion = useReducedMotion();
  // "now" is derived from the clock snapshot (ticks every 15s) so render stays pure.
  const now = clock.sessionStartedAt === null ? null : clock.sessionStartedAt + clock.elapsedMs;

  // Apply any pending (loosening) changes whose delay has elapsed. Re-runs on each clock tick.
  const settle = s.settle;
  useEffect(() => {
    settle();
  }, [settle, clock.elapsedMs]);

  const [exclusionDays, setExclusionDays] = useState<SelfExclusionDays>(SELF_EXCLUSION_OPTIONS[0]);
  const [confirmText, setConfirmText] = useState("");
  const confirmId = useId();

  if (!hydrated || now === null) {
    return (
      <div className={cn("hairline-t", className)} aria-busy="true">
        <ul className="divide-y divide-hairline">
          {Array.from({ length: 7 }).map((_, i) => (
            <li key={i} className="grid gap-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-14">
              <div className="h-7 w-40 rounded bg-sunken dark:bg-elevated" />
              <div className="h-9 w-64 rounded-full bg-sunken dark:bg-elevated" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const gate = evaluateGate(s, clock.playedTodayMs, now);

  const fade = reduceMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {reminder.due && (
          <motion.div
            key="reminder"
            role="status"
            aria-live="polite"
            {...fade}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 dark:bg-elevated md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-display text-2xl">You have been playing for {fmtDuration(reminder.elapsedMs)}.</p>
              <p className="mt-1 text-[13.5px] text-muted">A quiet nudge, as requested. Every spin is independent of the last; time is the only thing that accumulates.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => s.startCooldown(15)}>
                Take 15 minutes
              </Button>
              <Button size="sm" variant="ghost" onClick={reminder.dismiss}>
                Keep playing
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gate.blocked && (
        <div role="status" className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-border-strong px-5 py-4 text-[14px]">
          <Badge tone="neutral">Paused</Badge>
          <span className="text-ink">{gate.reason}</span>
          {gate.until && <span className="text-muted">Lifts {fmtDate(gate.until)}.</span>}
          <span className="ml-auto text-[13px] text-muted">Practice mode stays open.</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[13px] text-muted">
        <span>
          This session <span className="tnum text-ink">{fmtDuration(clock.elapsedMs)}</span>
          <span className="mx-2 text-faint">·</span>
          Today <span className="tnum text-ink">{fmtDuration(clock.playedTodayMs)}</span>
          {!clock.visible && <span className="ml-2 text-faint">(paused while hidden)</span>}
        </span>
        <span>Stored in this browser only.</span>
      </div>

      <ul className="divide-y divide-hairline hairline-t hairline-b">
        {/* Session reminder */}
        <Row
          title="Session reminder"
          description="Tell me when I've been playing for a set amount of time. Counts only while this tab is visible."
          status={
            s.sessionReminderMinutes === null ? (
              <span className="text-muted">Off</span>
            ) : (
              <>
                <Badge tone="accent">On</Badge>
                <span>Every {fmtMinutes(s.sessionReminderMinutes)}</span>
              </>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<SessionReminderMinutes>
              label="Session reminder interval"
              options={SESSION_REMINDER_OPTIONS.map((m) => ({ value: m, label: `${m} min` }))}
              value={s.sessionReminderMinutes}
              onChange={(m) => s.setSessionReminder(m)}
            />
            {s.sessionReminderMinutes !== null && (
              <Button size="sm" variant="ghost" onClick={() => s.setSessionReminder(null)}>
                Turn off
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={reminder.reset}>
              Reset session clock
            </Button>
          </div>
        </Row>

        {/* Cooldown */}
        <Row
          title="Cooldown"
          description="Step away for a while. Real-money tables close until the timer ends; a cooldown can be extended but not cut short."
          status={
            s.cooldownUntil && s.cooldownUntil > now ? (
              <>
                <Badge tone="neutral">Active</Badge>
                <span>
                  {fmtDuration(s.cooldownUntil - now)} remaining · ends {fmtDate(s.cooldownUntil)}
                </span>
              </>
            ) : (
              <span className="text-muted">Not active</span>
            )
          }
        >
          <Segmented<number>
            label="Start a cooldown"
            options={COOLDOWN_OPTIONS.map((o) => ({ value: o.minutes, label: o.label }))}
            value={null}
            onChange={(m) => s.startCooldown(m)}
          />
        </Row>

        {/* Self-exclusion */}
        <Row
          title="Self-exclusion"
          description="Close real-money play for a longer period. This cannot be reversed once confirmed. Practice mode remains available."
          status={
            s.selfExclusionUntil && s.selfExclusionUntil > now ? (
              <>
                <Badge tone="red">Excluded</Badge>
                <span>
                  {s.selfExclusionDays} days · until {fmtDate(s.selfExclusionUntil)}
                </span>
              </>
            ) : (
              <span className="text-muted">Not active</span>
            )
          }
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmText !== "CONFIRM") return;
              s.setSelfExclusion(exclusionDays);
              setConfirmText("");
            }}
          >
            <Segmented<SelfExclusionDays>
              label="Self-exclusion length"
              options={SELF_EXCLUSION_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))}
              value={exclusionDays}
              onChange={setExclusionDays}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={confirmId} className="sr-only">
                Type CONFIRM to self-exclude
              </label>
              <input
                id={confirmId}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type CONFIRM"
                autoComplete="off"
                spellCheck={false}
                className={cn(inputCls, "w-44 font-mono text-[13px] tracking-wide")}
              />
              <Button type="submit" variant="danger" size="md" disabled={confirmText !== "CONFIRM"}>
                {s.selfExclusionUntil && s.selfExclusionUntil > now ? "Extend" : "Self-exclude"} {exclusionDays} days
              </Button>
            </div>
          </form>
        </Row>

        {/* Deposit limit */}
        <Row
          title="Deposit limit"
          description="Cap what you can move into chips per day or week. Lowering takes effect now; raising or removing waits 24 hours."
          status={
            <>
              {s.depositLimit ? <span className="tnum">{fmtLimit(s.depositLimit)}</span> : <span className="text-muted">No limit set</span>}
              {s.pendingDepositLimit && (
                <span className="text-muted">
                  → {s.pendingDepositLimit.amount > 0 ? fmtLimit(s.pendingDepositLimit) : "no limit"} on {fmtDate(s.pendingDepositLimit.effectiveAt)}
                </span>
              )}
            </>
          }
        >
          <LimitEditor label="Deposit limit" current={s.depositLimit} pending={s.pendingDepositLimit} onSave={s.setDepositLimit} />
        </Row>

        {/* Loss limit */}
        <Row
          title="Loss limit"
          description="Cap net losses per day or week. When reached, real-money wagers are declined until the period resets."
          status={
            <>
              {s.lossLimit ? <span className="tnum">{fmtLimit(s.lossLimit)}</span> : <span className="text-muted">No limit set</span>}
              {s.pendingLossLimit && (
                <span className="text-muted">
                  → {s.pendingLossLimit.amount > 0 ? fmtLimit(s.pendingLossLimit) : "no limit"} on {fmtDate(s.pendingLossLimit.effectiveAt)}
                </span>
              )}
            </>
          }
        >
          <LimitEditor label="Loss limit" current={s.lossLimit} pending={s.pendingLossLimit} onSave={s.setLossLimit} />
        </Row>

        {/* Time limit */}
        <Row
          title="Time limit per day"
          description="Total play time allowed each calendar day, measured while the tab is visible. Resets at local midnight."
          status={
            s.dailyTimeLimitMinutes === null ? (
              <span className="text-muted">No limit set</span>
            ) : (
              <span>
                {fmtMinutes(s.dailyTimeLimitMinutes)} per day · <span className="tnum">{fmtDuration(clock.playedTodayMs)}</span> used
              </span>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<number>
              label="Daily time limit"
              options={TIME_LIMIT_OPTIONS.map((m) => ({ value: m, label: fmtMinutes(m) }))}
              value={s.dailyTimeLimitMinutes}
              onChange={(m) => s.setDailyTimeLimit(m)}
            />
            {s.dailyTimeLimitMinutes !== null && (
              <Button size="sm" variant="ghost" onClick={() => s.setDailyTimeLimit(null)}>
                Remove
              </Button>
            )}
          </div>
        </Row>

        {/* Account lock */}
        <Row
          title="Account lock"
          description="Freeze real-money play immediately. Unlocking takes 24 hours and can be cancelled during that window."
          status={
            s.accountLocked ? (
              <>
                <Badge tone="neutral">Locked</Badge>
                {s.unlockAt ? <span>Unlocks {fmtDate(s.unlockAt)}</span> : <span className="text-muted">Since now</span>}
              </>
            ) : (
              <span className="text-muted">Unlocked</span>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <Switch
              label="Account lock"
              checked={s.accountLocked}
              onChange={(v) => {
                if (v) s.lockAccount();
                else s.requestUnlock();
              }}
            />
            <span className="text-[13.5px] text-muted">{s.accountLocked ? "Locked" : "Lock my account"}</span>
            {s.accountLocked && s.unlockAt && (
              <Button size="sm" variant="ghost" onClick={s.cancelUnlock}>
                Cancel unlock
              </Button>
            )}
            {s.accountLocked && !s.unlockAt && (
              <span className="text-[13px] text-faint">Toggling off starts a {fmtDuration(LOOSEN_DELAY_MS)} delay.</span>
            )}
          </div>
        </Row>
      </ul>
    </div>
  );
}
