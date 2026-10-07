import { describe, expect, test } from "bun:test";
import { WakeState, parseOrigins, wakeHandler } from "../src/wake";

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
};

describe("WakeState", () => {
  test("asleep until pinged, awake for the TTL, then asleep again", () => {
    const c = clock();
    const s = new WakeState({ ttlMs: 90_000, minIntervalMs: 5_000, allowedOrigins: ["*"], now: c.now });
    expect(s.awake()).toBe(false);
    s.wake("a");
    expect(s.awake()).toBe(true);
    c.advance(89_999);
    expect(s.awake()).toBe(true);
    c.advance(1);
    expect(s.awake()).toBe(false);
  });
  test("a repeat ping from the same client inside minInterval is ignored, other clients are not", () => {
    const c = clock();
    const s = new WakeState({ ttlMs: 90_000, minIntervalMs: 5_000, allowedOrigins: ["*"], now: c.now });
    expect(s.wake("a").accepted).toBe(true);
    c.advance(1_000);
    expect(s.wake("a").accepted).toBe(false);
    expect(s.wake("b").accepted).toBe(true);
    c.advance(5_000);
    expect(s.wake("a").accepted).toBe(true);
    expect(s.snapshot().wakes).toBe(3);
  });
  test("origins", () => {
    const s = new WakeState({ ttlMs: 1, minIntervalMs: 0, allowedOrigins: parseOrigins("https://www.roblette.fun/, http://localhost:3110") });
    expect(s.originAllowed("https://www.roblette.fun")).toBe(true);
    expect(s.originAllowed("https://evil.example")).toBe(false);
    expect(s.originAllowed(null)).toBe(true);
    expect(parseOrigins(undefined)).toContain("https://www.roblette.fun");
  });
});

describe("wakeHandler", () => {
  const make = () => {
    const c = clock();
    const s = new WakeState({ ttlMs: 90_000, minIntervalMs: 5_000, allowedOrigins: ["https://www.roblette.fun"], now: c.now });
    return { s, h: wakeHandler(s, () => ({ seated: 1 })) };
  };
  test("POST /wake from an allowed origin wakes the table with CORS headers", async () => {
    const { s, h } = make();
    const r = h(new Request("http://op/wake", { method: "POST", headers: { origin: "https://www.roblette.fun" } }), "1.2.3.4");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://www.roblette.fun");
    expect((await r.json()).ok).toBe(true);
    expect(s.awake()).toBe(true);
  });
  test("a foreign origin is refused and does not wake the table", () => {
    const { s, h } = make();
    const r = h(new Request("http://op/wake", { method: "POST", headers: { origin: "https://evil.example" } }), "1.2.3.4");
    expect(r.status).toBe(403);
    expect(s.awake()).toBe(false);
  });
  test("preflight and health", async () => {
    const { h } = make();
    expect(h(new Request("http://op/wake", { method: "OPTIONS", headers: { origin: "https://www.roblette.fun" } }), "x").status).toBe(204);
    const health = await h(new Request("http://op/health"), "x").json();
    expect(health).toMatchObject({ ok: true, wake: { awake: false }, operator: { seated: 1 } });
    expect(h(new Request("http://op/nope"), "x").status).toBe(404);
  });
});
