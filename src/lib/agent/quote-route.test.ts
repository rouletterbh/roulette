// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { POST as quotePost } from "@/app/api/v1/quote/route";
import { POST as verifyPost } from "@/app/api/v1/verify/route";
import { POST as placeBetsPost } from "@/app/api/v1/intents/place-bets/route";
import { GET as healthGet } from "@/app/api/v1/health/route";
import { resetRateLimits } from "./rate-limit";
import { computeQuote } from "./quote";
import { getDemoRounds } from "@/lib/demo/rounds";
import { demoTreasury } from "@/lib/demo/data";
import { getMaximumSafeBet } from "@/lib/risk/engine";
import { decodeFunctionData } from "viem";
import { rouletteGameAbi } from "./intents";
import { MASK_RED } from "./encode-bets";

const post = (path: string, body: unknown, ip = "203.0.113.7") =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

describe("POST /api/v1/quote", () => {
  beforeEach(() => resetRateLimits());

  it("quotes a valid bet set with payouts, liability and the limit check", async () => {
    const res = await quotePost(post("/api/v1/quote", { bets: [{ betId: "red", stake: 10 }, { betId: "straight:19", stake: 1 }], table: "neon-01" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.demo).toBe(true);
    expect(json.data.totalWager).toBe(11);
    expect(json.data.bets[0].potentialPayout).toBe(20);
    expect(json.data.bets[1].potentialPayout).toBe(36);
    // worst case: 19 is red → both win: 20 + 36 = 56 returned, 11 staked → 45 net
    expect(json.data.maximumLiability).toEqual({ worstResult: 19, maxReturn: 56, maxNetPayout: 45 });
    expect(json.data.limit.ok).toBe(true);
    expect(json.data.accepted).toBe(true);
    expect(json.data.table.id).toBe("neon-01");
  });

  it("returns 'Table limit reached' when liability exceeds the per-round exposure cap", async () => {
    const res = await quotePost(post("/api/v1/quote", { bets: [{ betId: "straight:0", stake: 10 }] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.accepted).toBe(false);
    expect(json.data.limit.reason).toBe("Table limit reached");
    expect(json.data.limit.maxNetPayout).toBe(350);
    expect(json.data.limit.maxNetPayout).toBeGreaterThan(json.data.limit.maxRoundExposure);
  });

  it("rejects unknown bet ids, empty sets and malformed JSON", async () => {
    const bad = await quotePost(post("/api/v1/quote", { bets: [{ betId: "purple", stake: 1 }] }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");

    const empty = await quotePost(post("/api/v1/quote", { bets: [] }));
    expect(empty.status).toBe(400);

    const malformed = await quotePost(new Request("http://localhost/api/v1/quote", { method: "POST", body: "{not json" }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("BAD_REQUEST");

    const table = await quotePost(post("/api/v1/quote", { bets: [{ betId: "red", stake: 1 }], table: "nope" }));
    expect(table.status).toBe(404);
  });

  it("applies the table's stake range", () => {
    const q = computeQuote({ bets: [{ betId: "red", stake: 20 }], table: "classic" });
    expect(q.accepted).toBe(false);
    expect(q.limit.reason).toMatch(/outside the table range/);
    expect(q.limit.maxOutside).toBe(18);
    expect(q.limit.maxStraight).toBe(getMaximumSafeBet(demoTreasury, 35).maxStake);
  });

  it("rate limits bursts per IP", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) last = await quotePost(post("/api/v1/quote", { bets: [{ betId: "red", stake: 1 }] }, "198.51.100.9"));
    expect(last!.status).toBe(429);
    expect((await last!.json()).error.code).toBe("RATE_LIMITED");
    expect(last!.headers.get("retry-after")).toBeTruthy();
    // a different client is unaffected
    const other = await quotePost(post("/api/v1/quote", { bets: [{ betId: "red", stake: 1 }] }, "198.51.100.10"));
    expect(other.status).toBe(200);
  });
});

describe("POST /api/v1/verify", () => {
  beforeEach(() => resetRateLimits());

  it("verifies a generated demo round and flags a tampered result", async () => {
    const r = getDemoRounds()[0]!;
    const body = { roundId: r.roundId, commitment: r.commitment, serverSeed: r.serverSeed, playerSeed: r.playerSeed, blockRef: r.blockRef, result: r.result };
    const okRes = await verifyPost(post("/api/v1/verify", body));
    const okJson = await okRes.json();
    expect(okJson.ok).toBe(true);
    expect(okJson.demo).toBe(false);
    expect(okJson.data).toMatchObject({ commitOk: true, derivedResult: r.result, resultOk: true, verified: true });

    const badRes = await verifyPost(post("/api/v1/verify", { ...body, result: (r.result + 1) % 37 }));
    const badJson = await badRes.json();
    expect(badJson.data.resultOk).toBe(false);
    expect(badJson.data.verified).toBe(false);

    const noResult = await (await verifyPost(post("/api/v1/verify", { ...body, result: undefined }))).json();
    expect(noResult.data.resultOk).toBeNull();
    expect(noResult.data.verified).toBe(true);
  });

  it("rejects malformed hex", async () => {
    const res = await verifyPost(post("/api/v1/verify", { roundId: 1, commitment: "0x12", serverSeed: "0x", playerSeed: "0x", blockRef: "0x" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/intents/place-bets", () => {
  beforeEach(() => resetRateLimits());

  it("returns CONTRACTS_NOT_DEPLOYED with a decodable preview when no address is configured", async () => {
    delete process.env.NEXT_PUBLIC_ROULETTE_GAME_ADDRESS;
    const res = await placeBetsPost(post("/api/v1/intents/place-bets", { roundId: 120500, bets: [{ betId: "red", stake: 10 }], table: "neon-01" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.demo).toBe(true);
    expect(json.error.code).toBe("CONTRACTS_NOT_DEPLOYED");
    const intent = json.preview.intent;
    expect(intent.to).toBeNull();
    expect(intent.value).toBe("0");
    expect(intent.signedBy).toBe("agent-wallet");
    expect(json.preview.maxLiability).toBe(10);
    expect(json.preview.limitCheck.ok).toBe(true);
    const decoded = decodeFunctionData({ abi: rouletteGameAbi, data: intent.data });
    expect(decoded.functionName).toBe("placeBets");
    const [roundId, bets] = decoded.args as unknown as [bigint, Array<{ numbersMask: bigint; multiplier: number; stake: bigint }>];
    expect(roundId).toBe(120500n);
    expect(bets[0]).toEqual({ numbersMask: MASK_RED, multiplier: 1, stake: 10n });
  });

  it("returns the intent with `to` set when the address is configured", async () => {
    process.env.NEXT_PUBLIC_ROULETTE_GAME_ADDRESS = "0x1111111111111111111111111111111111111111";
    try {
      const res = await placeBetsPost(post("/api/v1/intents/place-bets", { roundId: "7", bets: [{ betId: "dozen:2", stake: 3 }] }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.intent.to).toBe("0x1111111111111111111111111111111111111111");
      expect(json.data.intent.chainId).toBe(46630);
    } finally {
      delete process.env.NEXT_PUBLIC_ROULETTE_GAME_ADDRESS;
    }
  });

  it("refuses to build an intent for a set that fails the limit check or has fractional stakes", async () => {
    const limit = await placeBetsPost(post("/api/v1/intents/place-bets", { roundId: 1, bets: [{ betId: "straight:0", stake: 10 }] }));
    expect(limit.status).toBe(409);
    const json = await limit.json();
    expect(json.error.code).toBe("TABLE_LIMIT");
    expect(json.error.details.quote.limit.reason).toBe("Table limit reached");

    const frac = await placeBetsPost(post("/api/v1/intents/place-bets", { roundId: 1, bets: [{ betId: "red", stake: 0.5 }] }));
    expect(frac.status).toBe(400);
  });
});

describe("GET /api/v1/health", () => {
  it("reports Robinhood Chain, demo mode and never-sign policy", async () => {
    const json = await (await healthGet()).json();
    expect(json.ok).toBe(true);
    expect(json.data.network).toBe("Robinhood Chain");
    expect(json.data.chain.id).toBe(46630);
    expect(json.data.signing).toMatch(/never/);
    expect(json.data.capabilities).toContain("intents");
  });
});
