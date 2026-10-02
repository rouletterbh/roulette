import { describe, it, expect, beforeEach, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { useGame } from "./game";
import { deriveResult, type RoundReveal } from "@/lib/fairness/commit-reveal";

vi.mock("@/lib/sound/engine", () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));

const g = () => useGame.getState();
const serverSeed = toHex(new Uint8Array(32).fill(1));
const playerSeed = toHex(new Uint8Array(32).fill(2));
const blockReference = toHex(new Uint8Array(32).fill(3));
const reveal = (roundId: number): RoundReveal => {
  const r: RoundReveal = { roundId, commitment: keccak256(serverSeed), playerSeed, createdAt: 0, serverSeed, blockReference, result: deriveResult(serverSeed, playerSeed, blockReference, roundId), verified: true };
  return r;
};

describe("game store chain transitions", () => {
  beforeEach(() => {
    g().init("quick", 0);
    useGame.setState({ balance: 100 }); // mirrored escrow
  });

  it("open → betting with the chain round id and commitment", () => {
    g().setChainRound({ type: "open", roundId: 9n, commitment: { roundId: 9, commitment: keccak256(serverSeed), playerSeed, createdAt: 1 } });
    expect(g().phase).toBe("betting");
    expect(g().roundId).toBe(9);
    expect(g().chainRoundId).toBe(9n);
    expect(g().commitment?.commitment).toBe(keccak256(serverSeed));
    expect(g().balance).toBe(100);
  });

  it("close keeps only chain-confirmed bets and does not touch the balance", () => {
    g().setChainRound({ type: "open", roundId: 9n, commitment: null });
    g().selectChip(5);
    g().addBet("red");
    g().addBet("straight:17"); // never submitted on chain
    g().setChainRound({ type: "close", bets: { red: 5 } });
    expect(g().phase).toBe("closed");
    expect(g().bets).toEqual({ red: 5 });
    expect(g().betsLocked).toBe(true);
    expect(g().balance).toBe(100);
    expect(g().lastBets).toEqual({ red: 5 });
    // closeRound (the demo path) is a no-op once closed
    g().closeRound();
    expect(g().phase).toBe("closed");
  });

  it("spin lands the wheel on the chain result and settles with the local math", () => {
    g().setChainRound({ type: "open", roundId: 9n, commitment: null });
    g().setChainRound({ type: "close", bets: { red: 5, "straight:17": 1 } });
    const r = reveal(9);
    g().setChainRound({ type: "spin", reveal: r });
    expect(g().phase).toBe("spinning");
    expect(g().pendingReveal?.result).toBe(r.result);
    g().onSpinComplete();
    expect(g().phase).toBe("result");
    expect(g().lastRound?.result).toBe(r.result);
    expect(g().lastRound?.reveal.verified).toBe(true);
    const returned = g().lastRound!.settlement.totalReturned;
    expect(g().balance).toBe(100 + returned);
    // spin is only valid from "closed"
    g().setChainRound({ type: "spin", reveal: r });
    expect(g().phase).toBe("result");
  });

  it("idle parks the table waiting for the operator and records an unseen result", () => {
    g().setChainRound({ type: "idle", roundId: 12n, result: 17 });
    expect(g().phase).toBe("result");
    expect(g().chainRoundId).toBe(12n);
    expect(g().recent[0]).toBe(17);
    g().setChainRound({ type: "idle", roundId: 12n, result: 17 });
    expect(g().recent.filter((n) => n === 17).length).toBe(1);
    g().setChainRound({ type: "open", roundId: 13n, commitment: null });
    expect(g().phase).toBe("betting");
    expect(g().bets).toEqual({});
  });

  it("init resets the chain round id", () => {
    g().setChainRound({ type: "open", roundId: 9n, commitment: null });
    g().init("practice");
    expect(g().chainRoundId).toBeNull();
  });
});
