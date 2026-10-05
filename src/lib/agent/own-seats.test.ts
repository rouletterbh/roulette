import { describe, it, expect } from "vitest";
import type { AgentSeat, AgentLogItem } from "@/store/agent-seat";
import { ownSeatEvents, ownSeats, summarizeOwnSeats } from "./own-seats";

const log = (kind: AgentLogItem["kind"], at: number, delta?: number): AgentLogItem => ({ id: `${kind}-${at}`, at, kind, text: `${kind} text`, delta });

const seat = (over: Partial<AgentSeat>): AgentSeat => ({
  id: "s1",
  code: "ARC-7",
  strategyClass: "Momentum",
  name: "Arc",
  thesis: "",
  collection: { primaryAssetId: null, fallbackAssetId: null },
  owner: "0xABC",
  tableId: "quick",
  rules: { bets: [{ betId: "red", stake: 1 }], cadence: "every", maxRounds: 10, stopLoss: 5, stopWin: null, timeLimitMinutes: 30 },
  allowance: 20,
  status: "active",
  isPublic: true,
  createdAt: 1,
  approvedAt: 2,
  stoppedReason: null,
  roundsPlayed: 3,
  net: 1,
  lastRoundId: 42,
  lastOutcomeWasLoss: false,
  log: [],
  traces: [],
  decisions: 2,
  skips: 1,
  followers: 0,
  ...over,
});

describe("ownSeats", () => {
  it("keeps the wallet's seats and practice seats, newest first, case-insensitively", () => {
    const seats = {
      a: seat({ id: "a", owner: "0xabc", createdAt: 1 }),
      b: seat({ id: "b", owner: "0xDEF", createdAt: 2 }),
      c: seat({ id: "c", owner: "practice", createdAt: 3 }),
    };
    expect(ownSeats(seats, "0xABC").map((s) => s.id)).toEqual(["c", "a"]);
    expect(ownSeats(seats, null).map((s) => s.id)).toEqual(["c"]);
  });
});

describe("summarizeOwnSeats", () => {
  it("counts states from seat status and last log entry, never from the demo network", () => {
    const s = summarizeOwnSeats([
      seat({ id: "a", status: "active", log: [log("bet", 5)] }),
      seat({ id: "b", status: "active", log: [log("result", 6, 2)] }),
      seat({ id: "c", status: "active", log: [log("skip", 7)] }),
      seat({ id: "d", status: "paused" }),
      seat({ id: "e", status: "stopped", log: [log("result", 1, 3), log("result", 2, -1), log("stopped", 3)] }),
    ]);
    expect(s).toMatchObject({ active: 3, seated: 3, executing: 1, settling: 1, observing: 1, paused: 1, stopped: 1, decisions: 10, skips: 5, collections: 2, rounds: 15 });
  });
  it("is all zeros with no seats", () => {
    expect(summarizeOwnSeats([])).toMatchObject({ active: 0, seated: 0, decisions: 0, skips: 0, collections: 0, rounds: 0 });
  });
});

describe("ownSeatEvents", () => {
  it("flattens seat logs into feed events, oldest first, marking winning results as collections", () => {
    const ev = ownSeatEvents([seat({ id: "a", code: "A-1", log: [log("result", 9, 4), log("bet", 3)] }), seat({ id: "b", code: "B-2", tableId: "7", lastRoundId: null, log: [log("approved", 5)] })]);
    expect(ev.map((e) => [e.code, e.kind, e.at])).toEqual([
      ["A-1", "prepare", 3],
      ["B-2", "wake", 5],
      ["A-1", "collect", 9],
    ]);
    expect(ev[2]).toMatchObject({ agentId: "a", tableId: "quick", roundId: 42, delta: 4, id: "a:result-9" });
    expect(ev[1].roundId).toBe(0);
  });
});

describe("chain-mode seats in the activity feed", () => {
  it("wallet and chain log lines are system events, never bets or collections", () => {
    const s = seat({ log: [log("chain", 5), log("bet", 6), log("result", 7, 2)] });
    const events = ownSeatEvents([s]);
    expect(events.map((e) => e.kind)).toEqual(["system", "prepare", "collect"]);
    expect(summarizeOwnSeats([s]).collections).toBe(1);
  });
});
