/**
 * End-to-end: local Anvil + forge Deploy.s.sol + run-rounds.ts for two rounds with a betting player.
 * Never touches a public network. Needs Foundry (~/.foundry/bin) and bun.
 *
 * Accounts (anvil defaults): #0 deployer/ADMIN/PAUSER/TREASURER, #1 player, #2 OPERATOR.
 * The OPERATOR is a separate key on purpose: Deploy.s.sol revokes the deployer's OPERATOR_ROLE after it
 * creates table 1, so OPERATOR == deployer would end up without the role (the test asserts that the
 * operator fails fast in exactly that situation).
 */
import { afterAll, expect, test } from "bun:test";
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, parseEther, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import gameAbiJson from "../abi/RouletteGame.json";
import randomnessAbiJson from "../abi/RandomnessManager.json";
import treasuryAbiJson from "../abi/CasinoTreasury.json";
import chipAbiJson from "../abi/Chip1155.json";
import riskAbiJson from "../abi/RiskEngine.json";

const gameAbi = gameAbiJson as Abi;
const randomnessAbi = randomnessAbiJson as Abi;
const treasuryAbi = treasuryAbiJson as Abi;
const chipAbi = chipAbiJson as Abi;
const riskAbi = riskAbiJson as Abi;

const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  player: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  operator: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const;
const deployer = privateKeyToAccount(KEYS.deployer);
const player = privateKeyToAccount(KEYS.player);
const operator = privateKeyToAccount(KEYS.operator);

const OPERATOR_DIR = resolve(import.meta.dir, "..");
const CONTRACTS_DIR = resolve(OPERATOR_DIR, "..", "..", "contracts");
const PATH = `${process.env.HOME}/.foundry/bin:${process.env.PATH}`;
const CHAIN_ID = 31337;

let anvil: ReturnType<typeof Bun.spawn> | null = null;
let operatorProc: ReturnType<typeof Bun.spawn> | null = null;
let miner: ReturnType<typeof setInterval> | null = null;
let stateDir = "";

afterAll(() => {
  if (miner) clearInterval(miner);
  operatorProc?.kill();
  anvil?.kill();
  if (stateDir && existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => res(port));
    });
    srv.on("error", rej);
  });
}

async function waitFor(cond: () => Promise<boolean>, ms: number, every = 100, what = "condition") {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await cond().catch(() => false)) return;
    await Bun.sleep(every);
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function runOperator(env: Record<string, string>, args: string[]) {
  const proc = Bun.spawn(["bun", "run", "src/run-rounds.ts", ...args], {
    cwd: OPERATOR_DIR,
    env: { ...process.env, PATH, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const events: Array<Record<string, unknown>> = [];
  const lines: string[] = [];
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    let buf = "";
    for await (const chunk of stream) {
      buf += new TextDecoder().decode(chunk);
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        lines.push(line);
        try { events.push(JSON.parse(line)); } catch { /* non-json (e.g. uncaught error) */ }
      }
    }
    if (buf.trim()) lines.push(buf.trim());
  };
  const done = Promise.all([pump(proc.stdout as ReadableStream<Uint8Array>), pump(proc.stderr as ReadableStream<Uint8Array>)]);
  return { proc, events, lines, exited: proc.exited.then(async (code) => { await done; return code; }) };
}

test("two rounds settle on anvil with a betting player", async () => {
  // ---- anvil
  const port = await freePort();
  const rpc = `http://127.0.0.1:${port}`;
  anvil = Bun.spawn(["anvil", "--port", String(port), "--chain-id", String(CHAIN_ID), "--silent"], { env: { ...process.env, PATH }, stdout: "ignore", stderr: "pipe" });
  const chain = defineChain({ id: CHAIN_ID, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 });
  const testClient = createTestClient({ chain, mode: "anvil", transport: http(rpc) });
  await waitFor(async () => (await pub.getChainId()) === CHAIN_ID, 15_000, 100, "anvil to start");

  // ---- deploy with the real script
  const deploy = Bun.spawn(
    ["forge", "script", "script/Deploy.s.sol:Deploy", "--rpc-url", rpc, "--private-key", KEYS.deployer, "--broadcast"],
    {
      cwd: CONTRACTS_DIR,
      env: {
        ...process.env,
        PATH,
        ADMIN: deployer.address,
        OPERATOR: operator.address,
        PAUSER: deployer.address,
        TREASURER: deployer.address,
        INITIAL_BANKROLL_WEI: "100000000000000000", // 0.1 ETH => 1000 units of house equity
        CHIP_PRICE_WEI: "100000000000000", // 1e14 wei per unit
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const deployCode = await deploy.exited;
  if (deployCode !== 0) throw new Error(`forge script failed:\n${await new Response(deploy.stdout).text()}\n${await new Response(deploy.stderr).text()}`);
  const broadcast = JSON.parse(readFileSync(join(CONTRACTS_DIR, "broadcast", "Deploy.s.sol", String(CHAIN_ID), "run-latest.json"), "utf8")) as {
    transactions: Array<{ transactionType: string; contractName?: string; contractAddress?: string }>;
  };
  const addr = (name: string): Address => {
    const t = broadcast.transactions.find((x) => x.transactionType === "CREATE" && x.contractName === name);
    if (!t?.contractAddress) throw new Error(`${name} not found in broadcast`);
    return t.contractAddress as Address;
  };
  const GAME = addr("RouletteGame");
  const RANDOMNESS = addr("RandomnessManager");
  const TREASURY = addr("CasinoTreasury");
  const CHIP = addr("Chip1155");
  const RISK = addr("RiskEngine");
  expect(await pub.readContract({ address: GAME, abi: gameAbi, functionName: "tableCount" })).toBe(1);

  // keep blocks flowing so the reveal delay (2 blocks) elapses without anyone transacting
  miner = setInterval(() => { testClient.mine({ blocks: 1 }).catch(() => {}); }, 250);

  stateDir = mkdtempSync(join(tmpdir(), "roulette-operator-"));
  const baseEnv = { RPC_URL: rpc, CHAIN_ID: String(CHAIN_ID), GAME_ADDRESS: GAME, RANDOMNESS_ADDRESS: RANDOMNESS, TABLE_IDS: "1", BETTING_SECONDS: "2", ROUND_GAP_SECONDS: "0", POLL_MS: "100", STATE_DIR: stateDir, WAKE_REQUIRED: "false" };

  // ---- fail fast: deployer lost OPERATOR_ROLE in Deploy.s.sol, so the operator must refuse to run
  const bad = await runOperator({ ...baseEnv, OPERATOR_PRIVATE_KEY: KEYS.deployer }, ["--dry-run"]);
  expect(await bad.exited).not.toBe(0);
  expect(bad.lines.join("\n")).toContain("does NOT hold OPERATOR_ROLE");

  // ---- dry run with the real operator key sends nothing
  const dryRun = await runOperator({ ...baseEnv, OPERATOR_PRIVATE_KEY: KEYS.operator }, ["--dry-run", "--rounds=1"]);
  expect(await dryRun.exited).toBe(0);
  expect(dryRun.events.some((e) => e.event === "plan")).toBe(true);
  expect(await pub.readContract({ address: RANDOMNESS, abi: randomnessAbi, functionName: "status", args: [1n] })).toBe(0);
  expect(existsSync(join(stateDir, "rounds.json"))).toBe(false);

  // ---- player: deposit -> approve -> enterTable
  const playerWallet = createWalletClient({ account: player, chain, transport: http(rpc) });
  const send = async (req: Parameters<typeof playerWallet.writeContract>[0]) => {
    const hash = await playerWallet.writeContract(req);
    const r = await pub.waitForTransactionReceipt({ hash });
    expect(r.status).toBe("success");
    return r;
  };
  await send({ address: TREASURY, abi: treasuryAbi, functionName: "deposit", value: parseEther("0.01"), account: player, chain });
  await send({ address: CHIP, abi: chipAbi, functionName: "setApprovalForAll", args: [TREASURY, true], account: player, chain });
  const ids: bigint[] = [];
  const amounts: bigint[] = [];
  for (const d of [100n, 50n, 25n, 10n, 5n, 1n]) {
    const bal = (await pub.readContract({ address: CHIP, abi: chipAbi, functionName: "balanceOf", args: [player.address, 1000n + d] })) as bigint;
    if (bal > 0n) { ids.push(1000n + d); amounts.push(bal); }
  }
  expect(ids.length).toBeGreaterThan(0);
  await send({ address: GAME, abi: gameAbi, functionName: "enterTable", args: [ids, amounts], account: player, chain });
  const escrow0 = (await pub.readContract({ address: GAME, abi: gameAbi, functionName: "escrow", args: [player.address] })) as bigint;
  expect(escrow0).toBe(70n); // 0.01 ETH * 70% liquidity / 1e14 wei per unit

  const MASK_RED = (await pub.readContract({ address: RISK, abi: riskAbi, functionName: "MASK_RED" })) as bigint;
  const MULT_EVEN_MONEY = (await pub.readContract({ address: RISK, abi: riskAbi, functionName: "MULT_EVEN_MONEY" })) as number;

  // ---- operator for two rounds, player bets 1 unit on red whenever a round is Open
  const op = await runOperator({ ...baseEnv, OPERATOR_PRIVATE_KEY: KEYS.operator }, ["--rounds=2"]);
  operatorProc = op.proc;
  const betOn = new Set<string>();
  let betting = true;
  const bettor = (async () => {
    while (betting) {
      for (const id of [1n, 2n]) {
        if (betOn.has(id.toString())) continue;
        const r = (await pub.readContract({ address: GAME, abi: gameAbi, functionName: "getRound", args: [id] })) as { status: number };
        if (r.status === 1) {
          betOn.add(id.toString());
          await send({ address: GAME, abi: gameAbi, functionName: "placeBets", args: [id, [{ numbersMask: MASK_RED, multiplier: MULT_EVEN_MONEY, stake: 1n }]], account: player, chain });
        }
      }
      await Bun.sleep(100);
    }
  })();
  const code = await Promise.race([op.exited, Bun.sleep(45_000).then(() => "timeout" as const)]);
  betting = false;
  await bettor;
  if (code !== 0) throw new Error(`operator exit ${code}\n${op.lines.join("\n")}`);
  expect(betOn.size).toBe(2);

  // ---- assertions
  let expectedEscrow = escrow0;
  for (const id of [1n, 2n]) {
    const g = (await pub.readContract({ address: GAME, abi: gameAbi, functionName: "getRound", args: [id] })) as { status: number; result: number; betCount: number; totalStaked: bigint; totalReturned: bigint };
    expect(g.status).toBe(3); // Settled
    expect(g.betCount).toBe(1);
    expect(g.result).toBeGreaterThanOrEqual(0);
    expect(g.result).toBeLessThanOrEqual(36);
    expect(await pub.readContract({ address: RANDOMNESS, abi: randomnessAbi, functionName: "verify", args: [id] })).toBe(true);
    const won = (MASK_RED >> BigInt(g.result)) & 1n;
    expectedEscrow += won ? 1n : -1n; // stake 1, even money returns 2
    expect(g.totalStaked).toBe(1n);
    expect(g.totalReturned).toBe(won ? 2n : 0n);
    const settled = op.events.find((e) => e.event === "round.settled" && e.roundId === id.toString());
    expect(settled).toBeDefined();
    expect(Number(settled!.result)).toBe(g.result);
    const revealed = op.events.find((e) => e.event === "round.revealed" && e.roundId === id.toString());
    expect(revealed!.localResult).toBe(revealed!.result);
  }
  const escrow1 = (await pub.readContract({ address: GAME, abi: gameAbi, functionName: "escrow", args: [player.address] })) as bigint;
  expect(escrow1).toBe(expectedEscrow);
  expect(await pub.readContract({ address: TREASURY, abi: treasuryAbi, functionName: "isSolvent" })).toBe(true);
  expect(await pub.readContract({ address: TREASURY, abi: treasuryAbi, functionName: "reservedUnits" })).toBe(0n);

  const rounds = JSON.parse(readFileSync(join(stateDir, "rounds.json"), "utf8")) as { nextRoundId: string; rounds: Record<string, { stage: string; seed: Hex }> };
  expect(rounds.nextRoundId).toBe("3");
  expect(rounds.rounds["1"].stage).toBe("settled");
  expect(rounds.rounds["2"].stage).toBe("settled");
  const status = JSON.parse(readFileSync(join(stateDir, "status.json"), "utf8")) as { tables: Record<string, { lastResult: { roundId: string; result: number } }>; recent: unknown[] };
  expect(status.tables["1"].lastResult.roundId).toBe("2");
  expect(status.recent.length).toBe(2);
}, 90_000);
