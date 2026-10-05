import { describe, expect, it } from "vitest";
import { pollReceipt } from "./receipt";

const HASH = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;
const clock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
};

describe("pollReceipt", () => {
  it("returns the receipt as soon as one request finds it, one request per tick", async () => {
    const c = clock();
    let calls = 0;
    const out = await pollReceipt(HASH, {
      ...c,
      getReceipt: async () => (++calls < 4 ? null : { status: "success" }),
      isKnown: async () => true,
    });
    expect(out).toEqual({ kind: "receipt", status: "success" });
    expect(calls).toBe(4);
  });
  it("treats 'not found' throws and transient RPC errors as not-yet", async () => {
    const c = clock();
    let calls = 0;
    const out = await pollReceipt(HASH, {
      ...c,
      getReceipt: async () => {
        calls++;
        if (calls === 1) throw new Error("Transaction receipt could not be found");
        if (calls === 2) throw new Error("HTTP request failed");
        return { status: "reverted" };
      },
      isKnown: async () => true,
    });
    expect(out).toEqual({ kind: "receipt", status: "reverted" });
  });
  it("times out and reports whether the node knows the transaction", async () => {
    const c = clock();
    const dropped = await pollReceipt(HASH, { ...c, timeoutMs: 6_000, intervalMs: 1_500, getReceipt: async () => null, isKnown: async () => false });
    expect(dropped).toEqual({ kind: "timeout", known: false });
    const pending = await pollReceipt(HASH, { ...clock(), timeoutMs: 3_000, getReceipt: async () => null, isKnown: async () => true });
    expect(pending).toEqual({ kind: "timeout", known: true });
    const rpcDown = await pollReceipt(HASH, { ...clock(), timeoutMs: 3_000, getReceipt: async () => null, isKnown: async () => { throw new Error("down"); } });
    expect(rpcDown).toEqual({ kind: "timeout", known: false });
  });
});
