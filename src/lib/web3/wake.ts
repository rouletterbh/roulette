/**
 * Wake-on-visit client. The round operator opens rounds only while someone is seated AND a
 * client pinged its /wake endpoint recently (agent/operator/src/wake.ts). The table page and
 * running agents call `pingOperator()` on their normal cadence; it throttles itself, never
 * throws, and is a no-op when NEXT_PUBLIC_OPERATOR_WAKE_URL is unset (e.g. demo mode or local).
 */
export const OPERATOR_WAKE_URL = (process.env.NEXT_PUBLIC_OPERATOR_WAKE_URL ?? "").replace(/\/+$/, "");
/** Comfortably inside the operator's 90 s TTL, so one missed ping never puts the table to sleep. */
export const WAKE_PING_MS = 30_000;

let lastPingAt = 0;
let inFlight: Promise<boolean> | null = null;

export function wakeConfigured(): boolean {
  return OPERATOR_WAKE_URL.length > 0;
}

/** Ping the operator unless one was sent in the last `minGapMs`. Resolves true when the operator answered OK. */
export function pingOperator(opts: { force?: boolean; minGapMs?: number; fetchImpl?: typeof fetch; now?: () => number } = {}): Promise<boolean> {
  if (!wakeConfigured()) return Promise.resolve(false);
  const now = (opts.now ?? Date.now)();
  const gap = opts.minGapMs ?? WAKE_PING_MS - 2_000;
  if (inFlight) return inFlight;
  if (!opts.force && now - lastPingAt < gap) return Promise.resolve(true);
  lastPingAt = now;
  const f = opts.fetchImpl ?? fetch;
  inFlight = f(`${OPERATOR_WAKE_URL}/wake`, { method: "POST", keepalive: true, cache: "no-store" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Test hook. */
export function resetWakeClient() {
  lastPingAt = 0;
  inFlight = null;
}
