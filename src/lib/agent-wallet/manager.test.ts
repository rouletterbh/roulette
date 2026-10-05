import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentSeats } from "@/store/agent-seat";
import { createAgentKey, deleteAgentKey } from "./keystore";
import { FakeChain } from "./__fixtures__/fake-chain";

const chains = new Map<string, FakeChain>();
vi.mock("./signer", () => ({
  agentIOFor: (seatId: string) => chains.get(seatId) ?? null,
}));

const { kickAgentRunners, requestAgentSweep, responsiblePlayBlock, useAgentLive } = await import("./manager");
const { useResponsibleStore } = await import("@/store/responsible");

const OWNER = "0x0000000000000000000000000000000000000B0b" as const;
const FLOAT = 300_000_000_000_000n;

async function until(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("condition not reached");
}

function newSeat(allowance = 20) {
  const made = useAgentSeats.getState().create({ name: "m", owner: OWNER, tableId: "1", rules: { bets: [{ betId: "red", stake: 2 }], cadence: "every", maxRounds: 5, stopLoss: 10, stopWin: null, timeLimitMinutes: 30 }, allowance, isPublic: false });
  if (!made.ok) throw new Error(made.error);
  return made.id;
}

beforeEach(() => {
  localStorage.clear();
  chains.clear();
  useAgentSeats.setState({ seats: {} });
  useAgentLive.setState({ bySeat: {} });
  useResponsibleStore.setState({ cooldownUntil: null, selfExclusionUntil: null, accountLocked: false, unlockAt: null, dailyTimeLimitMinutes: null });
});

describe("agent runner manager", () => {
  it("drives a funded, approved seat and publishes its live figures by seat id", async () => {
    const id = newSeat();
    const key = createAgentKey(id, OWNER);
    const chain = new FakeChain({ agent: key.address, owner: OWNER });
    chains.set(id, chain);
    useAgentSeats.getState().attachWallet(id, key.address);
    chain.fund(20, FLOAT);
    useAgentSeats.getState().markFunded(id);
    useAgentSeats.getState().approve(id);
    kickAgentRunners();
    await until(() => chain.escrow === 20n);
    await until(() => useAgentLive.getState().bySeat[id]?.phase === "observing");
    const live = useAgentLive.getState().bySeat[id];
    expect(live.address).toBe(key.address);
    expect(live.owner).toBe(OWNER);
    expect(live.snapshot?.escrow).toBe(20n);
    // identical figures on the next poll keep the same object (no re-render churn)
    kickAgentRunners();
    await new Promise((r) => setTimeout(r, 30));
    expect(useAgentLive.getState().bySeat[id]).toBe(live);

    useAgentSeats.getState().stop(id, "Stopped by owner.");
    kickAgentRunners();
    await until(() => chain.agentUnits === 0 && chain.eth === 0n);
    expect(chain.ownerChips).toBe(20);
    await until(() => useAgentSeats.getState().seats[id].chain?.sweptAt != null);
  });

  it("never acts by itself on a key whose seat record is gone; the owner's sweep returns the funds", async () => {
    const key = createAgentKey("orphan", OWNER);
    const chain = new FakeChain({ agent: key.address, owner: OWNER });
    chain.fund(15, FLOAT);
    chain.escrow = 5n;
    chains.set("orphan", chain);
    kickAgentRunners();
    await until(() => !!useAgentLive.getState().bySeat.orphan?.snapshot);
    kickAgentRunners();
    await new Promise((r) => setTimeout(r, 30));
    expect(chain.sent).toHaveLength(0);
    expect(useAgentLive.getState().bySeat.orphan.snapshot?.chipUnits).toBe(15);

    expect(requestAgentSweep("orphan")).toBe(true);
    await until(() => chain.agentUnits === 0 && chain.eth === 0n);
    expect(chain.ownerChips).toBe(20);
    expect(chain.sent.map((s) => s.kind)).toEqual(["leave", "chips", "eth"]);
  });

  it("does not touch a seat that is still waiting for approval, and forgets a deleted key", async () => {
    const id = newSeat();
    const key = createAgentKey(id, OWNER);
    const chain = new FakeChain({ agent: key.address, owner: OWNER });
    chain.eth = FLOAT; // gas arrived, chips did not; the owner has not approved
    chains.set(id, chain);
    useAgentSeats.getState().attachWallet(id, key.address);
    kickAgentRunners();
    await until(() => useAgentLive.getState().bySeat[id]?.phase === "awaiting-funds");
    expect(chain.sent).toHaveLength(0);

    expect(requestAgentSweep(id)).toBe(true);
    await until(() => chain.eth === 0n);
    expect(deleteAgentKey(id, { chipUnits: 0, escrow: 0n, winBalance: 0n, eth: 0n })).toEqual({ ok: true });
    kickAgentRunners();
    await until(() => useAgentLive.getState().bySeat[id] === undefined);
    expect(requestAgentSweep(id)).toBe(false);
  });

  it("the owner's responsible-play controls stop a running agent and bring its funds back", async () => {
    const id = newSeat();
    const key = createAgentKey(id, OWNER);
    const chain = new FakeChain({ agent: key.address, owner: OWNER });
    chains.set(id, chain);
    useAgentSeats.getState().attachWallet(id, key.address);
    chain.fund(20, FLOAT);
    useAgentSeats.getState().markFunded(id);
    useAgentSeats.getState().approve(id);
    kickAgentRunners();
    await until(() => chain.escrow === 20n);
    expect(responsiblePlayBlock()).toBeNull();

    useResponsibleStore.setState({ cooldownUntil: Date.now() + 60_000 });
    expect(responsiblePlayBlock()).toBe("A cooldown is in progress.");
    chain.openRound(1n);
    kickAgentRunners();
    await until(() => chain.agentUnits === 0 && chain.eth === 0n);
    expect(chain.betsSentFor(1n)).toBe(0);
    expect(chain.ownerChips).toBe(20);
    expect(useAgentSeats.getState().seats[id].stoppedReason).toBe("Stopped by your responsible-play settings: A cooldown is in progress.");
  });
});
