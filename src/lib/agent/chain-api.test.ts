// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import { activeChain } from "@/config/chains";
import { ROUND_STATUS } from "@/lib/web3/contracts";
import { chip1155Abi, rewardVaultAbi, rouletteGameAbi } from "@/lib/web3/abi";
import { MASK_RED, encodeBetById } from "./encode-bets";
import { ADDR, CASHCAT, NOW, PLAYER, account, asset, fakeChain, fakeReader, game, openRound, round109, treasury } from "./__fixtures__/chain";
import {
  ChainClaimBodySchema,
  ChainEnterTableBodySchema,
  ChainLeaveTableBodySchema,
  ChainPlaceBetsBodySchema,
  ChainQuoteBodySchema,
  chainClaimIntent,
  chainEnterTableIntent,
  chainHealth,
  chainLeaveTableIntent,
  chainLimits,
  chainPlaceBetsIntent,
  chainPrices,
  chainQuote,
  chainRewards,
  chainRound,
  chainRounds,
  chainStats,
  chainTable,
  chainTables,
  chainTreasury,
} from "./chain-api";

/**
 * Route logic for the chain-backed API against a fake reader: no network, no env.
 * Each handler returns the real Response, so status, headers and envelope are checked.
 */
const json = async (res: Response) => ({ status: res.status, cache: res.headers.get("cache-control"), body: (await res.json()) as any }); // eslint-disable-line @typescript-eslint/no-explicit-any

const lower = PLAYER.toLowerCase();
const enterBody = (o: Record<string, unknown> = {}) => ChainEnterTableBodySchema.parse({ address: lower, ...o });
const betsBody = (o: Record<string, unknown> = {}) => ChainPlaceBetsBodySchema.parse({ address: lower, bets: [{ betId: "red", stake: 5 }], ...o });
const leaveBody = (o: Record<string, unknown> = {}) => ChainLeaveTableBodySchema.parse({ address: lower, ...o });
const claimBody = (o: Record<string, unknown> = {}) => ChainClaimBodySchema.parse({ address: lower, asset: "CASHCAT", usdAmount: "1.5", ...o });

/** A chain where a round is open on table 1 and the player has 45 units in escrow. */
const seated = (over: Parameters<typeof fakeChain>[0] = {}) => {
  const open = openRound();
  return fakeChain({ rounds: [round109, open], opened: [300n], treasury: treasury({ escrowUnits: 45n }), account: account({ chips: { 1: 0n, 5: 1n, 10: 0n, 25: 0n, 50: 0n, 100: 0n }, chipUnits: 5, escrowUnits: 45n }), ...over });
};

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("reads", () => {
  it("GET /tables lists the on-chain table with treasury-backed limits and no current round", async () => {
    const r = await json(await chainTables(fakeReader()));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, demo: false });
    expect(r.cache).toMatch(/max-age=4/);
    expect(r.body.data.count).toBe(1);
    expect(r.body.data.tables[0]).toMatchObject({ id: "1", status: "live", currentRound: null, operator: "waiting-for-players", limits: { minBet: 1, maxBet: 500, maxOutside: 213, maxStraight: 6 } });
    expect(r.body.data.scanWindow.blocks).toBe(60_000);
  });

  it("GET /tables shows the open round and recent results for the table", async () => {
    const state = seated({ settled: [{ roundId: 109n, result: 28, totalStaked: 5n, totalReturned: 0n, blockNumber: 80_300_000n }] });
    const t = (await json(await chainTables(fakeReader(state)))).body.data.tables[0];
    expect(t.currentRound).toMatchObject({ id: 300, status: "Open", acceptingBets: true, betsCloseAt: NOW + 35, betsCloseAtApproximate: true });
    expect(t.operator).toBe("round-open");
    expect(t.recent).toEqual([28]);
  });

  it("GET /tables/{id} answers by numeric id and 404s legacy names", async () => {
    const hit = await json(await chainTable(fakeReader(), "1"));
    expect(hit.body.data.table.id).toBe("1");
    for (const id of ["neon-01", "2", "0", "01"]) {
      const miss = await json(await chainTable(fakeReader(), id));
      expect(miss.status, id).toBe(404);
      expect(miss.body).toMatchObject({ ok: false, demo: false, error: { code: "NOT_FOUND", details: { tables: ["1"] } } });
    }
  });

  it("GET /treasury and /limits come from the treasury snapshot", async () => {
    const t = (await json(await chainTreasury(fakeReader()))).body;
    expect(t.demo).toBe(false);
    expect(t.data.snapshot.bankroll).toBe(1016);
    expect(t.data.derived).toMatchObject({ availableBankroll: 852, maxRoundExposure: 213, isSolvent: true });
    const l = (await json(await chainLimits(fakeReader(), { multiplier: 17, existingLiability: 0 }))).body.data;
    expect(l).toMatchObject({ multiplier: 17, maxStake: 12, tableOpen: true });
  });

  it("GET /rounds lists settled rounds from the log window, newest first, with proofs", async () => {
    const r110 = { ...round109, roundId: 110n, tableId: 1 };
    const state = fakeChain({
      rounds: [round109, r110],
      settled: [
        { roundId: 109n, result: 28, totalStaked: 5n, totalReturned: 0n, blockNumber: 80_300_000n },
        { roundId: 110n, result: 28, totalStaked: 5n, totalReturned: 0n, blockNumber: 80_300_900n },
      ],
    });
    const all = (await json(await chainRounds(fakeReader(state), { limit: 20 }))).body.data;
    expect(all.rounds.map((r: { roundId: number }) => r.roundId)).toEqual([110, 109]);
    expect(all.rounds[1]).toMatchObject({ roundId: 109, result: 28, verified: true, settledAtBlock: 80_300_000 });
    // Round 110 reuses 109's seeds, so its proof must NOT verify (roundId is part of the preimage).
    expect(all.rounds[0].verified).toBe(false);
    expect(all).toMatchObject({ total: 2, nextCursor: null });
    expect(all.scanWindow.blocks).toBe(60_000);

    const page = (await json(await chainRounds(fakeReader(state), { limit: 1 }))).body.data;
    expect(page.rounds).toHaveLength(1);
    expect(page.nextCursor).toBe(110);
    const next = (await json(await chainRounds(fakeReader(state), { limit: 1, cursor: "110" }))).body.data;
    expect(next.rounds.map((r: { roundId: number }) => r.roundId)).toEqual([109]);

    expect((await json(await chainRounds(fakeReader(state), { limit: 20, table: "1" }))).body.data.total).toBe(2);
    expect((await json(await chainRounds(fakeReader(state), { limit: 20, table: "neon-01" }))).status).toBe(404);
  });

  it("GET /rounds is honestly empty when nothing settled inside the window", async () => {
    const r = (await json(await chainRounds(fakeReader(), { limit: 20 }))).body;
    expect(r).toMatchObject({ ok: true, demo: false, data: { rounds: [], total: 0, nextCursor: null } });
  });

  it("GET /rounds/{id} returns round 109 with result 28, verified, its bets and a verify body", async () => {
    const r = await json(await chainRound(fakeReader(), "109"));
    expect(r.status).toBe(200);
    expect(r.cache).toMatch(/max-age=60/);
    expect(r.body.data.round).toMatchObject({ roundId: 109, status: "Settled", result: 28, verified: true });
    expect(r.body.data.bets).toEqual([expect.objectContaining({ player: PLAYER, betId: "red", stake: 5 })]);
    expect(r.body.data.verify).toMatchObject({ endpoint: "/api/v1/verify", body: { roundId: 109, result: 28 } });
  });

  it("GET /rounds/{id} 404s an unknown id and rejects a malformed one", async () => {
    expect((await json(await chainRound(fakeReader(), "999999"))).body).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await json(await chainRound(fakeReader(), "abc"))).body.error.code).toBe("VALIDATION_ERROR");
    expect((await json(await chainRound(fakeReader(), (1n << 256n).toString()))).body.error.code).toBe("VALIDATION_ERROR");
    const open = await json(await chainRound(fakeReader(seated()), "300"));
    expect(open.body.data).toMatchObject({ round: { status: "Open", verified: null }, verify: null, bets: [] });
    expect(open.cache).toMatch(/max-age=4/);
  });

  it("GET /stats reports only what the scan supports, with the block window", async () => {
    const state = fakeChain({ settled: [{ roundId: 109n, result: 28, totalStaked: 5n, totalReturned: 0n, blockNumber: 80_300_000n }] });
    const s = (await json(await chainStats(fakeReader(state), { window: 100 }))).body.data;
    expect(s).toMatchObject({ sampled: 1, roundsSettled: 1, totalStaked: 5, totalReturned: 0, latest: [28], blockWindow: { blocks: 60_000 } });
    expect(s).not.toHaveProperty("players");
    expect((await json(await chainStats(fakeReader(state), { window: 100, table: "1" }))).body.data.sampled).toBe(1);
    expect((await json(await chainStats(fakeReader(state), { window: 100, table: "9" }))).status).toBe(404);
  });

  it("GET /rewards and /prices read the vault and its oracle", async () => {
    const r = (await json(await chainRewards(fakeReader()))).body;
    expect(r.demo).toBe(false);
    expect(r.data.assets.find((a: { symbol: string }) => a.symbol === "CASHCAT")).toMatchObject({ vaultStatus: "UNAVAILABLE", inventory: "0", priceStale: false });
    expect(r.data.vault).toMatchObject({ address: ADDR.rewardVault, totalWinBalanceUsd: 0 });
    const p = (await json(await chainPrices(fakeReader()))).body;
    expect(Array.isArray(p.data)).toBe(true);
    expect(p.data[0]).toMatchObject({ symbol: "CASHCAT", source: "onchain-oracle", stale: false, ageSeconds: 369 });
  });

  it("GET /health reports chain, contracts, pause flags, solvency and operator liveness", async () => {
    const state = seated();
    const h = (await json(await chainHealth(fakeReader(state)))).body;
    expect(h).toMatchObject({ ok: true, demo: false });
    expect(h.data).toMatchObject({
      status: "ok",
      demoMode: false,
      contractsDeployed: true,
      chain: { reachable: true, latestBlock: 80_320_255, l1BlockNumber: 26_122_222 },
      treasury: { solvent: true },
      paused: { game: { gameplay: false } },
      operator: { lastRoundOpened: { roundId: 300, status: "Open", ageSeconds: 10 }, newestOraclePrice: { ageSeconds: 369 }, seatedEscrowUnits: 45 },
    });
    expect(h.data.contracts.RouletteGame).toBe(ADDR.game);
    expect(h.data.operator.wallet).toBeNull();
    expect(h.data.warnings).toEqual([]);
    const funded = (await json(await chainHealth(fakeReader({ ...state, operatorWallet: { address: ADDR.game, balanceWei: 5_000_000_000_000_000n, source: "round-opened" } })))).body.data;
    expect(funded.operator.wallet).toMatchObject({ balanceEth: "0.005", lowGas: false, source: "round-opened" });
    expect(funded.warnings).toEqual([]);
    const low = (await json(await chainHealth(fakeReader({ ...state, operatorWallet: { address: ADDR.game, balanceWei: 400_000_000_000_000n, source: "oracle-post" } })))).body.data;
    expect(low.operator.wallet).toMatchObject({ balanceEth: "0.0004", lowGas: true, source: "oracle-post" });
    expect(low.warnings[0]).toMatch(/below 0\.001 ETH/);
    expect(low.status).toBe("ok");
    const idle = (await json(await chainHealth(fakeReader()))).body.data;
    expect(idle.operator.lastRoundOpened).toBeNull();
    expect(idle.operator.lastRoundOpenedNote).toMatch(/No RoundOpened log in the last 60000 blocks/);
  });

  it("GET /health still answers when the chain is unreachable, and says so", async () => {
    const h = await json(await chainHealth(fakeReader(fakeChain({ down: true }))));
    expect(h.status).toBe(200);
    expect(h.cache).toBe("no-store");
    expect(h.body.data).toMatchObject({ status: "degraded", demoMode: false, chain: { reachable: false } });
  });
});

describe("failure modes shared by every route", () => {
  it("CHAIN_UNAVAILABLE (503, no-store, Retry-After) when the RPC fails; nothing is substituted", async () => {
    const down = () => fakeReader(fakeChain({ down: true }));
    for (const res of [await chainTables(down()), await chainTreasury(down()), await chainRound(down(), "109"), await chainRewards(down()), await chainQuote(down(), ChainQuoteBodySchema.parse({ bets: [{ betId: "red", stake: 1 }] })), await chainEnterTableIntent(down(), enterBody())]) {
      const r = await json(res);
      expect(r.status).toBe(503);
      expect(r.cache).toBe("no-store");
      expect(res.headers.get("retry-after")).toBe("5");
      expect(r.body).toMatchObject({ ok: false, demo: false, error: { code: "CHAIN_UNAVAILABLE" } });
      expect(r.body.data).toBeUndefined();
      expect(r.body.preview).toBeUndefined();
    }
  });

  it("CONTRACTS_NOT_DEPLOYED when an address is not configured, with no preview", async () => {
    const state = fakeChain();
    state.addresses.game = null;
    const t = await json(await chainTables(fakeReader(state)));
    expect(t.status).toBe(409);
    expect(t.body).toMatchObject({ ok: false, demo: false, error: { code: "CONTRACTS_NOT_DEPLOYED", details: { contract: "game" } } });
    const i = await json(await chainEnterTableIntent(fakeReader(state), enterBody()));
    expect(i.body.error.code).toBe("CONTRACTS_NOT_DEPLOYED");
    expect(i.body.preview).toBeUndefined();
    const noVault = fakeChain();
    noVault.addresses.rewardVault = null;
    expect((await json(await chainClaimIntent(fakeReader(noVault), claimBody()))).body.error.code).toBe("CONTRACTS_NOT_DEPLOYED");
  });
});

describe("POST /quote (chain)", () => {
  const quote = (state: ReturnType<typeof fakeChain>, body: unknown) => chainQuote(fakeReader(state), ChainQuoteBodySchema.parse(body)).then(json);

  it("accepts a set under the cap and prices it in whole units", async () => {
    const r = await quote(fakeChain(), { bets: [{ betId: "red", stake: 10 }, { betId: "straight:17", stake: 1 }], table: "1" });
    expect(r.status).toBe(200);
    expect(r.cache).toBe("no-store");
    expect(r.body.demo).toBe(false);
    expect(r.body.data).toMatchObject({ totalWager: 11, accepted: true, maximumLiability: { worstResult: 17, maxReturn: 36, maxNetPayout: 25 }, limit: { ok: true, code: null, maxRoundExposure: 213, availableBankroll: 852, maxStraight: 6, maxOutside: 213 }, table: { id: "1", minBet: 1, maxBet: 500 }, round: null });
  });

  it("rejects over the exposure cap exactly where the contract would", async () => {
    expect((await quote(fakeChain(), { bets: [{ betId: "straight:17", stake: 6 }] })).body.data.accepted).toBe(true);
    const over = (await quote(fakeChain(), { bets: [{ betId: "straight:17", stake: 7 }] })).body.data;
    expect(over).toMatchObject({ accepted: false, limit: { reason: "Table limit reached", code: "exposure-cap", maxNetPayout: 245, maxRoundExposure: 213 } });
  });

  it("checks against the open round's existing bets and its own reservation", async () => {
    // 200 on Red already in round 300: it reserves 200 of the 213 cap; available bankroll already excludes it.
    const open = openRound({ betCount: 1, totalStaked: 200n, reservedUnits: 200n });
    const state = fakeChain({ rounds: [open], opened: [300n], bets: { "300": [{ player: PLAYER, ...encodeBetById("red", 200) }] }, treasury: treasury({ availableUnits: 652n, reservedUnits: 200n, escrowUnits: 10n }) });
    const more = (await quote(state, { bets: [{ betId: "red", stake: 20 }], table: "1" })).body.data;
    expect(more).toMatchObject({ accepted: false, limit: { code: "exposure-cap", maxNetPayout: 220, maxRoundExposure: 213, availableBankroll: 852, maxOutside: 13 }, round: { id: 300, status: "Open", existingBets: 1, reservedUnits: 200 } });
    // The opposite side lowers the round's worst case, so it is accepted.
    const hedge = (await quote(state, { bets: [{ betId: "black", stake: 20 }], table: "1" })).body.data;
    expect(hedge).toMatchObject({ accepted: true, limit: { maxNetPayout: 180 } });
    // Without a table, the quote is for an empty round.
    expect((await quote(state, { bets: [{ betId: "red", stake: 20 }] })).body.data).toMatchObject({ accepted: true, round: null, limit: { availableBankroll: 652 } });
  });

  it("applies the table's stake range, a closed round, pause and the bet-count limit", async () => {
    const small = fakeChain({ tables: [{ id: 1, minStake: 2n, maxStake: 50n, isPrivate: false, active: true }] });
    expect((await quote(small, { bets: [{ betId: "red", stake: 1 }], table: "1" })).body.data.limit).toMatchObject({ ok: false, code: "stake-out-of-range" });
    expect((await quote(small, { bets: [{ betId: "red", stake: 51 }], table: "1" })).body.data.limit.reason).toMatch(/outside the table range 2–50/);
    expect((await quote(fakeChain(), { bets: [{ betId: "red", stake: 1 }], roundId: 109 })).body.data).toMatchObject({ accepted: false, limit: { code: "round-not-open" }, round: { id: 109, status: "Settled" } });
    expect((await quote(fakeChain({ treasury: treasury({ pause: { treasury: 0, game: 2, vault: 0 } }) }), { bets: [{ betId: "red", stake: 1 }] })).body.data.limit.code).toBe("paused");
    expect((await quote(fakeChain({ game: game({ maxBetsPerRound: 1 }) }), { bets: [{ betId: "red", stake: 1 }, { betId: "black", stake: 1 }] })).body.data.limit.code).toBe("too-many-bets");
  });

  it("rejects unknown bets, fractional stakes, unknown tables and unknown rounds", async () => {
    expect((await quote(fakeChain(), { bets: [{ betId: "purple", stake: 1 }] })).body.error.code).toBe("VALIDATION_ERROR");
    const frac = await quote(fakeChain(), { bets: [{ betId: "red", stake: 0.5 }] });
    expect(frac.status).toBe(400);
    expect(frac.body.error.message).toMatch(/whole number of chip units/);
    expect((await quote(fakeChain(), { bets: [{ betId: "red", stake: 1 }], table: "neon-01" })).status).toBe(404);
    expect((await quote(fakeChain(), { bets: [{ betId: "red", stake: 1 }], roundId: 7 })).status).toBe(404);
  });
});

describe("POST /intents/enter-table (chain)", () => {
  it("selects every chip in the wallet and encodes enterTable for the real game address", async () => {
    const r = await json(await chainEnterTableIntent(fakeReader(), enterBody()));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, demo: false });
    const { intent, prerequisites, units, chips, account: acct } = r.body.data;
    expect(intent).toMatchObject({ to: ADDR.game, contract: "RouletteGame", chainId: activeChain.id, value: "0", signedBy: "agent-wallet" });
    const decoded = decodeFunctionData({ abi: rouletteGameAbi, data: intent.data });
    expect(decoded.functionName).toBe("enterTable");
    expect(decoded.args).toEqual([[1050n], [1n]]);
    expect(units).toBe(50);
    expect(chips).toEqual([{ denomination: 50, tokenId: "1050", count: 1 }]);
    expect(prerequisites).toEqual([]);
    expect(acct).toMatchObject({ address: PLAYER, walletChipUnits: 50, escrowUnits: 0, chipsApproved: true });
    expect(intent.warnings.join(" ")).not.toMatch(/Requires a prior/);
  });

  it("puts the Chip1155 approval first when the treasury is not yet approved", async () => {
    const r = (await json(await chainEnterTableIntent(fakeReader(fakeChain({ account: account({ approved: false }) })), enterBody()))).body.data;
    expect(r.prerequisites).toHaveLength(1);
    expect(r.prerequisites[0]).toMatchObject({ to: ADDR.chip, contract: "Chip1155" });
    const approval = decodeFunctionData({ abi: chip1155Abi, data: r.prerequisites[0].data });
    expect(approval.functionName).toBe("setApprovalForAll");
    expect(approval.args).toEqual([ADDR.treasury, true]);
    expect(r.note).toMatch(/Sign the approval in prerequisites first/);
  });

  it("selects largest-first for a requested amount, like the web app", async () => {
    const wallet = account({ chips: { 1: 3n, 5: 2n, 10: 0n, 25: 1n, 50: 0n, 100: 0n }, chipUnits: 38 });
    const r = (await json(await chainEnterTableIntent(fakeReader(fakeChain({ account: wallet })), enterBody({ units: 32 })))).body.data;
    expect(r.units).toBe(32);
    // 25 + 5 + 1 + 1: the same chips the web app picks; ids are encoded in ascending order.
    expect(decodeFunctionData({ abi: rouletteGameAbi, data: r.intent.data }).args).toEqual([[1001n, 1005n, 1025n], [2n, 1n, 1n]]);
    expect(r.chips).toEqual([{ denomination: 25, tokenId: "1025", count: 1 }, { denomination: 5, tokenId: "1005", count: 1 }, { denomination: 1, tokenId: "1001", count: 2 }]);
    const exact = (await json(await chainEnterTableIntent(fakeReader(fakeChain({ account: wallet })), enterBody({ chips: [{ denomination: 5, count: 2 }] })))).body.data;
    expect(exact.units).toBe(10);
  });

  it("NO_CHIPS when the wallet holds none", async () => {
    const r = await json(await chainEnterTableIntent(fakeReader(fakeChain({ account: account({ chips: { 1: 0n, 5: 0n, 10: 0n, 25: 0n, 50: 0n, 100: 0n }, chipUnits: 0 }) })), enterBody()));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, demo: false, error: { code: "NO_CHIPS", details: { account: { walletChipUnits: 0 }, deposit: { to: ADDR.treasury } } } });
    expect(r.body.data).toBeUndefined();
  });

  it("INSUFFICIENT_CHIPS when the wallet cannot cover or exactly make the amount", async () => {
    const tooMany = await json(await chainEnterTableIntent(fakeReader(), enterBody({ units: 80 })));
    expect(tooMany.body.error).toMatchObject({ code: "INSUFFICIENT_CHIPS" });
    const notExact = await json(await chainEnterTableIntent(fakeReader(), enterBody({ units: 7 })));
    expect(notExact.status).toBe(409);
    expect(notExact.body.error).toMatchObject({ code: "INSUFFICIENT_CHIPS", details: { coverableUnits: 0 } });
    const named = await json(await chainEnterTableIntent(fakeReader(), enterBody({ chips: [{ denomination: 50, count: 2 }] })));
    expect(named.body.error.code).toBe("INSUFFICIENT_CHIPS");
  });

  it("PAUSED when gameplay is paused", async () => {
    const r = await json(await chainEnterTableIntent(fakeReader(fakeChain({ treasury: treasury({ pause: { treasury: 2, game: 0, vault: 0 } }) })), enterBody()));
    expect(r.body.error.code).toBe("PAUSED");
  });

  it("validates and checksums the caller address", () => {
    expect(enterBody().address).toBe(PLAYER);
    expect(ChainEnterTableBodySchema.safeParse({ address: "0x1C01912b96ba6783ae8c3c1d8e135ee185079aa5" }).success).toBe(false); // wrong checksum
    expect(ChainEnterTableBodySchema.safeParse({ address: "0x1234" }).success).toBe(false);
    expect(ChainEnterTableBodySchema.safeParse({}).success).toBe(false);
    expect(ChainEnterTableBodySchema.safeParse({ address: lower, units: 5, chips: [{ denomination: 5, count: 1 }] }).success).toBe(false);
  });
});

describe("POST /intents/place-bets (chain)", () => {
  it("encodes placeBets for the table's open round when escrow and limits allow", async () => {
    const r = await json(await chainPlaceBetsIntent(fakeReader(seated()), betsBody()));
    expect(r.status).toBe(200);
    expect(r.body.demo).toBe(false);
    const { intent, quote, round, account: acct } = r.body.data;
    expect(intent).toMatchObject({ to: ADDR.game, chainId: activeChain.id, value: "0" });
    const decoded = decodeFunctionData({ abi: rouletteGameAbi, data: intent.data });
    expect(decoded.functionName).toBe("placeBets");
    expect(decoded.args).toEqual([300n, [{ numbersMask: MASK_RED, multiplier: 1, stake: 5n }]]);
    expect(quote).toMatchObject({ accepted: true, totalWager: 5, round: { id: 300 } });
    expect(round).toMatchObject({ id: 300, table: "1", status: "Open", betsCloseAt: NOW + 35, betsCloseAtApproximate: true });
    expect(acct.escrowUnits).toBe(45);
    // An explicit round id works the same way.
    expect((await json(await chainPlaceBetsIntent(fakeReader(seated()), betsBody({ roundId: "300" })))).status).toBe(200);
  });

  it("ROUND_NOT_OPEN when nobody is seated and no round is open (a normal state)", async () => {
    const r = await json(await chainPlaceBetsIntent(fakeReader(), betsBody()));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, demo: false, error: { code: "ROUND_NOT_OPEN", details: { table: "1", latestRound: null, operator: "waiting-for-players" } } });
    expect(r.body.error.message).toMatch(/enter the table first/);
    expect(r.body.preview).toBeUndefined();
  });

  it("ROUND_NOT_OPEN for a settled, closed or unknown round", async () => {
    const settled = await json(await chainPlaceBetsIntent(fakeReader(), betsBody({ roundId: 109 })));
    expect(settled.body.error).toMatchObject({ code: "ROUND_NOT_OPEN", details: { roundId: 109, status: "Settled" } });
    const unknown = await json(await chainPlaceBetsIntent(fakeReader(), betsBody({ roundId: 12345 })));
    expect(unknown.body.error).toMatchObject({ code: "ROUND_NOT_OPEN", details: { status: "None" } });
    const closed = seated({ rounds: [openRound({ status: ROUND_STATUS.Closed })] });
    const c = await json(await chainPlaceBetsIntent(fakeReader(closed), betsBody()));
    expect(c.body.error).toMatchObject({ code: "ROUND_NOT_OPEN", details: { latestRound: { id: 300, status: "Closed" }, operator: "between-rounds" } });
  });

  it("INSUFFICIENT_ESCROW when the stake exceeds the caller's escrow", async () => {
    const r = await json(await chainPlaceBetsIntent(fakeReader(seated({ account: account({ escrowUnits: 3n }) })), betsBody()));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: "INSUFFICIENT_ESCROW", details: { required: 5, account: { escrowUnits: 3, walletChipUnits: 50 } } });
  });

  it("TABLE_LIMIT when the round would exceed the treasury cap or the table range", async () => {
    const rich = account({ escrowUnits: 400n });
    const over = await json(await chainPlaceBetsIntent(fakeReader(seated({ account: rich })), betsBody({ bets: [{ betId: "straight:17", stake: 7 }] })));
    expect(over.status).toBe(409);
    expect(over.body.error).toMatchObject({ code: "TABLE_LIMIT", message: "Table limit reached", details: { quote: { limit: { code: "exposure-cap", maxNetPayout: 245 } } } });
    const range = await json(await chainPlaceBetsIntent(fakeReader(seated({ account: rich, tables: [{ id: 1, minStake: 2n, maxStake: 50n, isPrivate: false, active: true }] })), betsBody({ bets: [{ betId: "red", stake: 1 }] })));
    expect(range.body.error).toMatchObject({ code: "TABLE_LIMIT", details: { quote: { limit: { code: "stake-out-of-range" } } } });
  });

  it("PAUSED, NOT_FOUND and VALIDATION_ERROR", async () => {
    expect((await json(await chainPlaceBetsIntent(fakeReader(seated({ treasury: treasury({ escrowUnits: 45n, pause: { treasury: 0, game: 2, vault: 0 } }) })), betsBody()))).body.error.code).toBe("PAUSED");
    expect((await json(await chainPlaceBetsIntent(fakeReader(seated()), betsBody({ table: "neon-01" })))).status).toBe(404);
    expect((await json(await chainPlaceBetsIntent(fakeReader(seated()), betsBody({ bets: [{ betId: "purple", stake: 1 }] })))).body.error.code).toBe("VALIDATION_ERROR");
    expect(ChainPlaceBetsBodySchema.safeParse({ address: lower, bets: [{ betId: "red", stake: 0.5 }] }).success).toBe(false);
    expect(ChainPlaceBetsBodySchema.safeParse({ bets: [{ betId: "red", stake: 1 }] }).success).toBe(false);
  });
});

describe("POST /intents/leave-table (chain)", () => {
  it("encodes leaveTable for the whole escrow by default, or the amount asked", async () => {
    const state = seated();
    const all = (await json(await chainLeaveTableIntent(fakeReader(state), leaveBody()))).body.data;
    expect(all.units).toBe("45");
    expect(all.intent.to).toBe(ADDR.game);
    expect(decodeFunctionData({ abi: rouletteGameAbi, data: all.intent.data })).toMatchObject({ functionName: "leaveTable", args: [45n] });
    const some = (await json(await chainLeaveTableIntent(fakeReader(state), leaveBody({ units: 20 })))).body.data;
    expect(some).toMatchObject({ units: "20", preflight: { escrowAfter: 25 } });
  });

  it("INSUFFICIENT_ESCROW with nothing in escrow or less than requested", async () => {
    const none = await json(await chainLeaveTableIntent(fakeReader(), leaveBody()));
    expect(none.status).toBe(409);
    expect(none.body).toMatchObject({ ok: false, demo: false, error: { code: "INSUFFICIENT_ESCROW", details: { account: { escrowUnits: 0 } } } });
    const less = await json(await chainLeaveTableIntent(fakeReader(seated()), leaveBody({ units: 46 })));
    expect(less.body.error).toMatchObject({ code: "INSUFFICIENT_ESCROW", details: { requested: "46" } });
  });
});

describe("POST /intents/claim (chain)", () => {
  const NOW_MS = 1_791_155_809_000;
  /** CASHCAT funded with 250 tokens; the player holds a $3 win balance; quote at $0.16388. */
  const funded = (over: Parameters<typeof fakeChain>[0] = {}) =>
    fakeChain({
      assets: [asset(CASHCAT, { vault: { status: 2, inventory: 250n * 10n ** 18n } })],
      account: account({ winBalanceUsd1e18: 3n * 10n ** 18n }),
      quote: { amountOut: 9_153_038_808_884_549_670n, price: 163_880_000_000_000_000n },
      ...over,
    });

  it("ASSET_UNAVAILABLE while the vault holds no inventory (mainnet today), before anything else", async () => {
    const r = await json(await chainClaimIntent(fakeReader(), claimBody()));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, demo: false, error: { code: "ASSET_UNAVAILABLE", details: { asset: { symbol: "CASHCAT", vaultStatus: "UNAVAILABLE", inventory: "0" } } } });
    expect(r.body.error.message).toMatch(/holds no inventory/);
    expect(r.body.preview).toBeUndefined();
  });

  it("ASSET_UNAVAILABLE for unlisted, unregistered, disabled, stale or under-stocked assets", async () => {
    const code = async (state: ReturnType<typeof fakeChain>, body = claimBody()) => (await json(await chainClaimIntent(fakeReader(state), body))).body.error;
    expect(await code(fakeChain(), claimBody({ asset: "stock-nvda" }))).toMatchObject({ code: "ASSET_UNAVAILABLE", details: { asset: { status: "unverified" } } });
    expect((await code(fakeChain({ assets: [] }))).code).toBe("ASSET_UNAVAILABLE");
    expect((await code(funded({ assets: [asset(CASHCAT, { vault: { status: 2, inventory: 10n ** 18n, enabled: false } })] }))).message).toMatch(/not enabled/);
    expect((await code(funded({ assets: [asset(CASHCAT, { vault: { status: 0, inventory: 10n ** 18n } })] }))).message).toMatch(/price is missing or stale/);
    expect((await code(funded({ quote: null }))).message).toMatch(/could not quote/);
    expect((await code(funded({ assets: [asset(CASHCAT, { vault: { status: 1, inventory: 10n ** 18n } })] }))).message).toMatch(/this claim needs/);
  });

  it("encodes claimAs with minOut from the quote less slippage and a 10 minute deadline, like the web app", async () => {
    const r = await json(await chainClaimIntent(fakeReader(funded()), claimBody(), NOW_MS));
    expect(r.status).toBe(200);
    expect(r.body.demo).toBe(false);
    const d = r.body.data;
    expect(d.intent).toMatchObject({ to: ADDR.rewardVault, contract: "RewardVault", chainId: activeChain.id, value: "0" });
    const minOut = (9_153_038_808_884_549_670n * 9950n) / 10_000n;
    const deadline = BigInt(NOW_MS / 1000 + 600);
    const decoded = decodeFunctionData({ abi: rewardVaultAbi, data: d.intent.data });
    expect(decoded.functionName).toBe("claimAs");
    expect(decoded.args).toEqual([CASHCAT, 15n * 10n ** 17n, minOut, deadline]);
    expect(d).toMatchObject({ usdAmount1e18: "1500000000000000000", minOut: minOut.toString(), slippageBps: 50, deadline: deadline.toString(), quote: { amountOut: "9153038808884549670", priceUsd: 0.16388 }, asset: { symbol: "CASHCAT", vaultStatus: "AVAILABLE" } });
    // The asset can be named by address or registry id, and slippage / deadline / minOut can be set.
    const custom = (await json(await chainClaimIntent(fakeReader(funded()), claimBody({ asset: CASHCAT, slippageBps: 100, deadlineMinutes: 20 }), NOW_MS))).body.data;
    expect(custom.minOut).toBe(((9_153_038_808_884_549_670n * 9900n) / 10_000n).toString());
    expect(custom.deadline).toBe(String(NOW_MS / 1000 + 1200));
    const fixed = (await json(await chainClaimIntent(fakeReader(funded()), claimBody({ asset: "crypto-cashcat", minOut: "1" }), NOW_MS))).body.data;
    expect(fixed).toMatchObject({ minOut: "1", slippageBps: null });
  });

  it("INSUFFICIENT_WIN_BALANCE, PAUSED, NOT_FOUND and validation", async () => {
    const poor = await json(await chainClaimIntent(fakeReader(funded({ account: account({ winBalanceUsd1e18: 10n ** 18n }) })), claimBody()));
    expect(poor.status).toBe(409);
    expect(poor.body.error).toMatchObject({ code: "INSUFFICIENT_WIN_BALANCE", details: { account: { winBalanceUsd: 1 } } });
    expect((await json(await chainClaimIntent(fakeReader(funded({ treasury: treasury({ pause: { treasury: 0, game: 0, vault: 4 } }) })), claimBody()))).body.error.code).toBe("PAUSED");
    expect((await json(await chainClaimIntent(fakeReader(funded()), claimBody({ asset: "DOGE" })))).status).toBe(404);
    const small = await json(await chainClaimIntent(fakeReader(funded()), claimBody({ usdAmount: "0.25" })));
    expect(small.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(small.body.error.message).toMatch(/below the vault's minimum payout/);
    expect(ChainClaimBodySchema.safeParse({ address: lower, asset: "CASHCAT", usdAmount: "1", extra: true }).success).toBe(false);
    expect(ChainClaimBodySchema.safeParse({ asset: "CASHCAT", usdAmount: "1" }).success).toBe(false);
  });
});

describe("the API never needs a key", () => {
  it("reads only: every intent is built from the caller's address and public state", async () => {
    const reader = fakeReader(seated());
    await chainEnterTableIntent(reader, enterBody());
    await chainPlaceBetsIntent(reader, betsBody());
    await chainLeaveTableIntent(reader, leaveBody());
    const methods = Object.keys(reader.calls);
    expect(methods.every((m) => ["head", "treasury", "game", "tables", "latestRounds", "round", "rounds", "bets", "settledRounds", "rewardAssets", "vaultTotals", "quoteClaim", "account"].includes(m))).toBe(true);
    expect(reader.calls.account).toBe(3);
  });

  it("uses the address the caller supplied for the preflight", async () => {
    const other = "0x00000000000000000000000000000000000000Aa" as Address;
    const r = (await json(await chainEnterTableIntent(fakeReader(), ChainEnterTableBodySchema.parse({ address: other.toLowerCase() })))).body.data;
    expect(r.account.address.toLowerCase()).toBe(other.toLowerCase());
  });
});
