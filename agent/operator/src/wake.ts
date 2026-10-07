/**
 * Wake-on-visit: the round operator opens rounds only while someone is seated AND a client
 * (the table page, or a running agent) has pinged recently. Without this an idle seat drained
 * the operator's gas on empty rounds (940 rounds in ~42 h on 2026-10-05/07, 2 with bets).
 *
 * Pure state + the HTTP handler, so it is unit-testable without a socket.
 */
export interface WakeOptions {
  /** How long one ping keeps the table awake. */
  ttlMs: number;
  /** Ignore pings from one client closer together than this (log/CPU hygiene; correctness does not depend on it). */
  minIntervalMs: number;
  /** Exact origins allowed to ping from a browser; "*" allows any. */
  allowedOrigins: readonly string[];
  now?: () => number;
}

export class WakeState {
  private lastWakeAt = 0;
  private lastByClient = new Map<string, number>();
  private wakes = 0;
  constructor(private readonly o: WakeOptions) {}
  private now() {
    return (this.o.now ?? Date.now)();
  }
  /** Record a ping. Returns the time until which the table stays awake. */
  wake(client: string): { accepted: boolean; awakeUntil: number } {
    const t = this.now();
    const prev = this.lastByClient.get(client) ?? 0;
    const accepted = t - prev >= this.o.minIntervalMs;
    if (accepted) {
      this.lastByClient.set(client, t);
      this.lastWakeAt = t;
      this.wakes++;
      if (this.lastByClient.size > 5_000) this.lastByClient.clear();
    }
    return { accepted, awakeUntil: this.lastWakeAt + this.o.ttlMs };
  }
  awake(): boolean {
    return this.lastWakeAt > 0 && this.now() - this.lastWakeAt < this.o.ttlMs;
  }
  snapshot() {
    return { awake: this.awake(), lastWakeAt: this.lastWakeAt || null, ttlMs: this.o.ttlMs, wakes: this.wakes };
  }
  originAllowed(origin: string | null): boolean {
    if (!origin) return true; // server-to-server / curl: no browser CORS involved
    return this.o.allowedOrigins.includes("*") || this.o.allowedOrigins.includes(origin);
  }
}

export function parseOrigins(v: string | undefined): string[] {
  return (v ?? "https://www.roblette.fun,https://roblette.fun,http://localhost:3110,http://localhost:3000")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** HTTP handler: POST /wake, GET /health, CORS preflight. `status` is merged into /health. */
export function wakeHandler(state: WakeState, status: () => unknown) {
  return (req: Request, clientIp: string): Response => {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const cors: Record<string, string> =
      origin && state.originAllowed(origin)
        ? { "access-control-allow-origin": origin, vary: "origin", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600" }
        : {};
    const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors } });
    if (req.method === "OPTIONS") return new Response(null, { status: origin && state.originAllowed(origin) ? 204 : 403, headers: cors });
    if (url.pathname === "/wake" && (req.method === "POST" || req.method === "GET")) {
      if (!state.originAllowed(origin)) return json({ ok: false, error: "origin not allowed" }, 403);
      const r = state.wake(clientIp || "unknown");
      return json({ ok: true, accepted: r.accepted, awakeUntil: new Date(r.awakeUntil).toISOString() });
    }
    if (url.pathname === "/health" || url.pathname === "/") return json({ ok: true, wake: state.snapshot(), operator: status() });
    return json({ ok: false, error: "not found" }, 404);
  };
}
