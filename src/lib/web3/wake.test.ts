import { afterEach, describe, expect, it, vi } from "vitest";

describe("pingOperator", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("is a no-op without NEXT_PUBLIC_OPERATOR_WAKE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_WAKE_URL", "");
    const { pingOperator, wakeConfigured } = await import("./wake");
    const f = vi.fn();
    expect(wakeConfigured()).toBe(false);
    expect(await pingOperator({ fetchImpl: f as unknown as typeof fetch })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("posts to /wake, throttles, and never throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_WAKE_URL", "https://op.example/");
    const { pingOperator } = await import("./wake");
    let t = 1_000_000;
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await pingOperator({ fetchImpl: f as unknown as typeof fetch, now: () => t })).toBe(true);
    expect(f).toHaveBeenCalledWith("https://op.example/wake", expect.objectContaining({ method: "POST" }));
    t += 5_000;
    await pingOperator({ fetchImpl: f as unknown as typeof fetch, now: () => t });
    expect(f).toHaveBeenCalledTimes(1); // throttled
    t += 30_000;
    const failing = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await pingOperator({ fetchImpl: failing as unknown as typeof fetch, now: () => t })).toBe(false);
    expect(failing).toHaveBeenCalledTimes(1);
    t += 1;
    await pingOperator({ force: true, fetchImpl: f as unknown as typeof fetch, now: () => t });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
