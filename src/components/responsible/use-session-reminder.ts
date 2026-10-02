"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { PLAYTIME_KEY, todayKey, useResponsibleStore } from "@/store/responsible";

/**
 * Session clock. A tiny external store (so no setState-in-effect) that:
 *  - remembers when the current session started (localStorage),
 *  - starts a fresh session after 30 minutes of absence,
 *  - only counts time while the document is visible,
 *  - accumulates today's played time into a daily ledger.
 */
const SESSION_KEY = "responsible-play:session";
const ABSENCE_RESET_MS = 30 * 60 * 1000;
const TICK_MS = 15_000;

export interface SessionSnapshot {
  sessionStartedAt: number | null;
  elapsedMs: number;
  playedTodayMs: number;
  visible: boolean;
}

const SERVER_SNAPSHOT: SessionSnapshot = { sessionStartedAt: null, elapsedMs: 0, playedTodayMs: 0, visible: true };

let snapshot: SessionSnapshot = SERVER_SNAPSHOT;
let lastTick: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the clock still works for this tab */
  }
}

function loadSessionStart(now: number): number {
  const s = read<{ start: number; lastSeen: number }>(SESSION_KEY);
  if (s && now - s.lastSeen < ABSENCE_RESET_MS) {
    write(SESSION_KEY, { start: s.start, lastSeen: now });
    return s.start;
  }
  write(SESSION_KEY, { start: now, lastSeen: now });
  return now;
}

function addPlayed(ms: number): number {
  const day = todayKey();
  const ledger = read<{ day: string; ms: number }>(PLAYTIME_KEY);
  const base = ledger && ledger.day === day ? ledger.ms : 0;
  const next = base + Math.max(0, ms);
  write(PLAYTIME_KEY, { day, ms: next });
  return next;
}

function emit() {
  for (const l of listeners) l();
}

function tick() {
  const now = Date.now();
  const visible = document.visibilityState === "visible";
  const start = snapshot.sessionStartedAt ?? loadSessionStart(now);
  let played = snapshot.playedTodayMs;
  if (visible) {
    played = addPlayed(lastTick === null ? 0 : now - lastTick);
    lastTick = now;
    write(SESSION_KEY, { start, lastSeen: now });
  } else {
    lastTick = null;
  }
  snapshot = { sessionStartedAt: start, elapsedMs: now - start, playedTodayMs: played, visible };
  emit();
}

function onVisibility() {
  tick();
}

function start() {
  const now = Date.now();
  const ledger = read<{ day: string; ms: number }>(PLAYTIME_KEY);
  snapshot = {
    sessionStartedAt: loadSessionStart(now),
    elapsedMs: 0,
    playedTodayMs: ledger && ledger.day === todayKey() ? ledger.ms : 0,
    visible: document.visibilityState === "visible",
  };
  lastTick = snapshot.visible ? now : null;
  timer = setInterval(tick, TICK_MS);
  document.addEventListener("visibilitychange", onVisibility);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  lastTick = null;
  document.removeEventListener("visibilitychange", onVisibility);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

function getSnapshot() {
  return snapshot;
}
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** Starts a brand-new session clock (does not touch today's ledger). */
export function resetSessionClock() {
  const now = Date.now();
  write(SESSION_KEY, { start: now, lastSeen: now });
  snapshot = { ...snapshot, sessionStartedAt: now, elapsedMs: 0 };
  emit();
}

export function useSessionClock(): SessionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Session reminder. `due` flips to true once the session has run for the
 * configured number of minutes; `dismiss()` snoozes it for one more interval.
 */
export function useSessionReminder() {
  const minutes = useResponsibleStore((s) => s.sessionReminderMinutes);
  const clock = useSessionClock();
  const [snoozedUntilMs, setSnoozedUntilMs] = useState(0);

  const thresholdMs = minutes === null ? Infinity : minutes * 60_000;
  const due = clock.elapsedMs >= thresholdMs && clock.elapsedMs >= snoozedUntilMs;

  const dismiss = useCallback(() => {
    setSnoozedUntilMs(clock.elapsedMs + (minutes === null ? Infinity : minutes * 60_000));
  }, [clock.elapsedMs, minutes]);

  const reset = useCallback(() => {
    resetSessionClock();
    setSnoozedUntilMs(0);
  }, []);

  return { minutes, elapsedMs: clock.elapsedMs, playedTodayMs: clock.playedTodayMs, due, dismiss, reset };
}
