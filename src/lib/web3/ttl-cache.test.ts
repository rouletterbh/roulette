// @vitest-environment node
import { describe, it, expect } from "vitest";
import { LogWindow, TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  it("serves a value until its TTL passes, then reloads", async () => {
    let now = 1_000;
    let loads = 0;
    const cache = new TtlCache(() => now);
    const load = async () => ++loads;
    expect(await cache.get("k", 4_000, load)).toBe(1);
    now += 3_999;
    expect(await cache.get("k", 4_000, load)).toBe(1);
    now += 1;
    expect(await cache.get("k", 4_000, load)).toBe(2);
    expect(loads).toBe(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    let loads = 0;
    const cache = new TtlCache(() => 0);
    const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(++loads), 5));
    const [a, b, c] = await Promise.all([cache.get("k", 1_000, load), cache.get("k", 1_000, load), cache.get("k", 1_000, load)]);
    expect([a, b, c]).toEqual([1, 1, 1]);
    expect(loads).toBe(1);
  });

  it("never caches an error: the next call loads again", async () => {
    let attempt = 0;
    const cache = new TtlCache(() => 0);
    const load = async () => {
      if (++attempt === 1) throw new Error("rpc down");
      return "ok";
    };
    await expect(cache.get("k", 60_000, load)).rejects.toThrow("rpc down");
    expect(cache.size).toBe(0);
    expect(await cache.get("k", 60_000, load)).toBe("ok");
    expect(attempt).toBe(2);
  });

  it("keeps keys apart and stays bounded", async () => {
    let now = 0;
    const cache = new TtlCache(() => now, 4);
    for (let i = 0; i < 10; i++) {
      now += 1;
      expect(await cache.get(`k${i}`, 1_000_000, async () => i)).toBe(i);
    }
    expect(cache.size).toBeLessThanOrEqual(4);
  });
});

describe("LogWindow", () => {
  const item = (blockNumber: bigint) => ({ blockNumber });

  it("scans the whole window once, then only the new blocks", async () => {
    const ranges: Array<[bigint, bigint]> = [];
    const w = new LogWindow(async (from, to) => {
      ranges.push([from, to]);
      return to >= 1_050n && from <= 1_050n ? [item(1_050n)] : from <= 900n ? [item(900n)] : [];
    }, 500n);
    const first = await w.refresh(1_000n);
    expect(ranges).toEqual([[500n, 1_000n]]);
    expect(first.items.map((i) => i.blockNumber)).toEqual([900n]);
    expect(first).toMatchObject({ fromBlock: 500n, toBlock: 1_000n });

    const second = await w.refresh(1_100n);
    expect(ranges[1]).toEqual([1_001n, 1_100n]);
    expect(second.items.map((i) => i.blockNumber)).toEqual([900n, 1_050n]);
    expect(second).toMatchObject({ fromBlock: 600n, toBlock: 1_100n });

    // Same head: no fetch at all.
    await w.refresh(1_100n);
    expect(ranges).toHaveLength(2);
  });

  it("drops items that slide out of the window", async () => {
    const w = new LogWindow(async (from) => (from <= 900n ? [item(900n)] : []), 500n);
    await w.refresh(1_000n);
    const later = await w.refresh(1_450n);
    expect(later.items).toHaveLength(0);
    expect(later.fromBlock).toBe(950n);
  });

  it("falls back to a fifth of the window when the RPC rejects the full range, and reports the range it used", async () => {
    const w = new LogWindow(async (from, to) => {
      if (to - from > 100n) throw new Error("block range too large");
      return [item(to)];
    }, 500n);
    const r = await w.refresh(1_000n);
    expect(r).toMatchObject({ fromBlock: 900n, toBlock: 1_000n });
    expect(r.items).toHaveLength(1);
  });

  it("leaves the window untouched when a fetch fails", async () => {
    let fail = false;
    const w = new LogWindow(async (from, to) => {
      if (fail) throw new Error("rpc down");
      return [item(to)];
    }, 500n);
    await w.refresh(1_000n);
    fail = true;
    await expect(w.refresh(1_010n)).rejects.toThrow("rpc down");
    fail = false;
    const r = await w.refresh(1_010n);
    expect(r.items.map((i) => i.blockNumber)).toEqual([1_000n, 1_010n]);
  });
});
