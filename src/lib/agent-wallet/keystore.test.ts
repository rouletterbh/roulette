import { beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { useAgentSeats } from "@/store/agent-seat";
import { AGENT_KEY_PREFIX, ETH_DUST_WEI, createAgentKey, deleteAgentKey, deletionBlocker, getAgentKeyInfo, holdsFunds, listAgentKeys, readAgentPrivateKey, type AgentHoldings } from "./keystore";

const OWNER = "0x0000000000000000000000000000000000000B0b" as const;
const EMPTY: AgentHoldings = { chipUnits: 0, escrow: 0n, winBalance: 0n, eth: 0n };

beforeEach(() => {
  localStorage.clear();
  useAgentSeats.setState({ seats: {} });
});

describe("agent keystore", () => {
  it("creates one key per seat, in its own storage entry, and returns the same key on a second create", () => {
    const a = createAgentKey("seat-a", OWNER);
    const b = createAgentKey("seat-b", OWNER);
    expect(a.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(a.address).not.toBe(b.address);
    expect(createAgentKey("seat-a", OWNER).address).toBe(a.address); // never overwritten
    expect(localStorage.getItem(`${AGENT_KEY_PREFIX}seat-a`)).toBeTruthy();
    expect(getAgentKeyInfo("seat-a")).toEqual(a);
    expect(listAgentKeys().map((k) => k.seatId).sort()).toEqual(["seat-a", "seat-b"]);
  });

  it("the public info never contains the key, and the key matches the address", () => {
    const info = createAgentKey("seat-a", OWNER);
    const key = readAgentPrivateKey("seat-a")!;
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    expect(privateKeyToAccount(key).address).toBe(info.address);
    expect(JSON.stringify(info)).not.toContain(key);
    expect(JSON.stringify(listAgentKeys())).not.toContain(key.slice(2));
    expect(info.owner).toBe(OWNER);
  });

  it("returns null for a missing or tampered entry", () => {
    expect(getAgentKeyInfo("nope")).toBeNull();
    expect(readAgentPrivateKey("nope")).toBeNull();
    const info = createAgentKey("seat-a", OWNER);
    const raw = JSON.parse(localStorage.getItem(`${AGENT_KEY_PREFIX}seat-a`)!);
    localStorage.setItem(`${AGENT_KEY_PREFIX}seat-a`, JSON.stringify({ ...raw, address: OWNER }));
    expect(getAgentKeyInfo("seat-a")).toBeNull(); // address no longer derives from the key
    localStorage.setItem(`${AGENT_KEY_PREFIX}seat-a`, JSON.stringify(raw));
    expect(getAgentKeyInfo("seat-a")?.address).toBe(info.address);
  });

  it("refuses to create a key when storage is unavailable", () => {
    expect(() => createAgentKey("seat-a", OWNER, null)).toThrow(/storage/);
  });

  it("refuses to delete while the address holds chips, escrow, a win balance or more ETH than dust", () => {
    createAgentKey("seat-a", OWNER);
    const cases: Array<[AgentHoldings, RegExp]> = [
      [{ ...EMPTY, chipUnits: 1 }, /holds 1 chips/],
      [{ ...EMPTY, escrow: 3n }, /3 chips in escrow/],
      [{ ...EMPTY, winBalance: 1n }, /win balance/],
      [{ ...EMPTY, eth: ETH_DUST_WEI + 1n }, /holds ETH/],
    ];
    for (const [h, why] of cases) {
      expect(holdsFunds(h)).toBe(true);
      const r = deleteAgentKey("seat-a", h);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(why);
      expect(getAgentKeyInfo("seat-a")).not.toBeNull();
    }
  });

  it("refuses to delete when the balances could not be read", () => {
    createAgentKey("seat-a", OWNER);
    const r = deleteAgentKey("seat-a", null);
    expect(r.ok).toBe(false);
    expect(deletionBlocker(null)).toMatch(/could not be read/);
    expect(getAgentKeyInfo("seat-a")).not.toBeNull();
  });

  it("deletes an empty address (dust ETH allowed)", () => {
    createAgentKey("seat-a", OWNER);
    expect(holdsFunds({ ...EMPTY, eth: ETH_DUST_WEI })).toBe(false);
    expect(deleteAgentKey("seat-a", { ...EMPTY, eth: ETH_DUST_WEI })).toEqual({ ok: true });
    expect(getAgentKeyInfo("seat-a")).toBeNull();
    expect(localStorage.getItem(`${AGENT_KEY_PREFIX}seat-a`)).toBeNull();
  });

  it("the key never appears in the zustand-persisted seat JSON", () => {
    const store = useAgentSeats.getState();
    const made = store.create({ name: "k", owner: OWNER, tableId: "1", rules: { bets: [{ betId: "red", stake: 1 }], cadence: "every", maxRounds: 5, stopLoss: 5, stopWin: null, timeLimitMinutes: 5 }, allowance: 10, isPublic: true });
    if (!made.ok) throw new Error(made.error);
    const info = createAgentKey(made.id, OWNER);
    store.attachWallet(made.id, info.address);
    store.markFunded(made.id);
    store.approve(made.id);
    store.beginChainBet(made.id, 7, [{ betId: "red", stake: 1 }], { roundId: 7, at: 0, decision: "BET RED", rule: "", input: "", condition: true, leash: "pass", tx: null });
    store.setChainBetTx(made.id, 7, "0xabc");

    const key = readAgentPrivateKey(made.id)!;
    const persisted = localStorage.getItem("agent-seats")!;
    expect(persisted).toContain(info.address); // the address is public and is there
    expect(persisted).not.toContain(key);
    expect(persisted.toLowerCase()).not.toContain(key.slice(2).toLowerCase());
    expect(JSON.stringify(useAgentSeats.getState().seats).toLowerCase()).not.toContain(key.slice(2).toLowerCase());
    // and no other storage entry than the key's own carries it
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i)!;
      if (name === `${AGENT_KEY_PREFIX}${made.id}`) continue;
      expect(localStorage.getItem(name)!.toLowerCase()).not.toContain(key.slice(2).toLowerCase());
    }
  });
});
