/**
 * End-to-end run of the on-chain agent against a LOCAL ANVIL node. Nothing here can
 * reach mainnet: every transaction goes to 127.0.0.1, and the script refuses to start
 * if its RPC is not a local address.
 *
 *   E2E_MODE=local bun run src/lib/agent-wallet/e2e/agent.e2e.ts   (default)
 *   E2E_MODE=fork  bun run src/lib/agent-wallet/e2e/agent.e2e.ts
 *
 * Both modes drive the SAME modules the browser uses (keystore, seat store, signer,
 * viem I/O, AgentRunner) with an anvil test key as the owner:
 *   owner deposits for chips → creates a seat and a burner key → funds it (gas float,
 *   then chips) → the runner approves, enters and bets → the runner is thrown away and
 *   recreated mid-round ("reload") → a stop → leave → sweep → balances reconciled to the wei.
 *
 * local: plain anvil + contracts/script/Deploy.s.sol + the REAL round operator
 *        (agent/operator/src/run-rounds.ts, seated-only) committing, opening, closing,
 *        revealing and settling. Rounds settle with real results; the leash stops the agent.
 * fork:  anvil fork of Robinhood Chain mainnet with the deployed contracts and their state;
 *        the mainnet operator ADDRESS is impersonated (its key is not here). On a fork
 *        the EVM's NUMBER is the L1-style block number and BLOCKHASH of it is zero, so
 *        RandomnessManager.reveal voids every round: this mode therefore proves bet →
 *        void → refund and the owner's Sweep against the real contracts, not win/lose.
 *
 * Needs Foundry in ~/.foundry/bin.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, custom, defineChain, http, keccak256, parseEther, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MODE = (process.env.E2E_MODE ?? "local") as "local" | "fork";
const RPC = process.env.E2E_RPC ?? "http://127.0.0.1:8546";
const FORK_URL = process.env.E2E_FORK_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = MODE === "fork" ? 4663 : 31337;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(RPC)) throw new Error(`refusing to run against a non-local RPC: ${RPC}`);
const PORT = RPC.split(":").pop()!;
const ROOT = resolve(import.meta.dirname, "../../../..");
const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const PATH = `${FOUNDRY}:${process.env.PATH}`;

// Mainnet deployment (contracts/DEPLOYMENTS.md), used in fork mode; state comes from the fork.
const MAINNET = {
  game: "0x4d02F58D9e3e0CccaD49dB18ed0609661d61B94A",
  chip: "0xE68741905bDb68D67264409857a9C985Eaa0e2b2",
  treasury: "0xD376887C8103a8697A0009b6bb13e061C0b7e535",
  randomness: "0xd57Fa0Bb23E43C1Ad872e82BB8D5c5D1A03C3e76",
  rewardVault: "0x83Ea24a4276fe47967F375bc8ca10F870c070A5B",
  acl: "0x42C6B7cd66Ad226CDd89cde0eC0D025DA9702911",
} as const satisfies Record<string, Address>;
const OPERATOR_CANDIDATES: Address[] = ["0xfb40926a545Ea1B8c7448b25734D039777082A1E", "0xC80D34d68bAB225890958Cd3326d89030713689c"];
// Anvil's well-known test keys. Public, worthless, and only ever used against the local node.
const ANVIL = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  owner: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  operator: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
} as const;

const ALLOWANCE = 20;
const STAKE = 2;
const MAX_ROUNDS = 4;
const STOP_LOSS = 6;
const GAS_FLOAT = parseEther("0.0003");
/** The agent's approximate betting window; the operator's real one in local mode. */
const BETTING_SECONDS = MODE === "fork" ? 45 : 20;
/** What Robinhood Chain charged per gas when measured; the agent's reserve maths sees this figure. */
const BASE_FEE = 20_000_000n;

// Browser storage for the keystore and the persisted seat store, in memory.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;
(globalThis as unknown as { window: unknown }).window = globalThis;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const checks: Array<[string, boolean]> = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push([name, ok]);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
}

const children: ChildProcess[] = [];
let stateDir = "";
const operatorLog: string[] = [];

function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<{ code: number | null; out: string }> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, PATH, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => res({ code, out }));
  });
}

async function main() {
  const { rouletteGameAbi, chip1155Abi, casinoTreasuryAbi, randomnessManagerAbi, accessControllerAbi, CHIP_IDS, balancesFromBatch, chipUnits, selectChips, ROUND_STATUS } = await import("@/lib/web3/contracts");
  const { useAgentSeats } = await import("@/store/agent-seat");
  const { createAgentKey, readAgentPrivateKey, deleteAgentKey, getAgentKeyInfo, AGENT_KEY_PREFIX, ETH_DUST_WEI } = await import("../keystore");
  const { agentIOFor } = await import("../signer");
  const { storeSeatPort } = await import("../seat-port");
  const { AgentRunner } = await import("../runner");

  // ------------------------------------------------------------------- anvil
  const anvilArgs = MODE === "fork" ? ["--fork-url", FORK_URL, "--chain-id", String(CHAIN_ID), "--port", PORT] : ["--chain-id", String(CHAIN_ID), "--port", PORT, "--block-base-fee-per-gas", BASE_FEE.toString()];
  children.push(spawn(`${FOUNDRY}/anvil`, anvilArgs, { stdio: ["ignore", "ignore", "inherit"] }));
  const chain = defineChain({ id: CHAIN_ID, name: MODE === "fork" ? "Robinhood Chain (anvil fork)" : "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }), pollingInterval: 100 });
  const test = createTestClient({ chain, mode: "anvil", transport: http(RPC, { timeout: 60_000 }) });
  for (let i = 0; ; i++) {
    try {
      if ((await pub.getChainId()) === CHAIN_ID) break;
    } catch {
      if (i > 150) throw new Error("anvil did not start");
    }
    await sleep(200);
  }
  const startBlock = await pub.getBlockNumber();
  console.log(`mode ${MODE}: anvil at ${RPC}, chain ${CHAIN_ID}, block ${startBlock}${MODE === "fork" ? ` (fork of ${FORK_URL})` : ""}`);
  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) => pub.readContract({ address, abi, functionName, args } as never) as Promise<T>;

  // --------------------------------------------------------------- contracts
  let C: { game: Address; chip: Address; treasury: Address; randomness: Address; rewardVault: Address | null };
  const owner = privateKeyToAccount(ANVIL.owner);
  if (MODE === "fork") {
    C = MAINNET;
    await test.setBalance({ address: owner.address, value: parseEther("1") });
    // On mainnet this well-known test address carries an EIP-7702 delegation (0xef0100…) whose code rejects
    // ERC-1155 receipts; on the fork it is reset to a plain account, which is what the test key is.
    await test.setCode({ address: owner.address, bytecode: "0x" });
  } else {
    const deployer = privateKeyToAccount(ANVIL.deployer);
    const operator = privateKeyToAccount(ANVIL.operator);
    const contractsDir = join(ROOT, "contracts");
    // Same parameters as agent/operator/test/anvil.e2e.ts; forge writes only its (gitignored) cache/out/broadcast folders.
    const d = await run("forge", ["script", "script/Deploy.s.sol:Deploy", "--rpc-url", RPC, "--private-key", ANVIL.deployer, "--broadcast"], {
      cwd: contractsDir,
      env: { ADMIN: deployer.address, OPERATOR: operator.address, PAUSER: deployer.address, TREASURER: deployer.address, INITIAL_BANKROLL_WEI: "100000000000000000", CHIP_PRICE_WEI: "100000000000000" },
    });
    if (d.code !== 0) throw new Error(`forge script failed:\n${d.out.slice(-2000)}`);
    const broadcast = JSON.parse(readFileSync(join(contractsDir, "broadcast", "Deploy.s.sol", String(CHAIN_ID), "run-latest.json"), "utf8")) as { transactions: Array<{ transactionType: string; contractName?: string; contractAddress?: string }> };
    const addr = (name: string): Address => {
      const t = broadcast.transactions.find((x) => x.transactionType === "CREATE" && x.contractName === name);
      if (!t?.contractAddress) throw new Error(`${name} not found in broadcast`);
      return t.contractAddress as Address;
    };
    C = { game: addr("RouletteGame"), chip: addr("Chip1155"), treasury: addr("CasinoTreasury"), randomness: addr("RandomnessManager"), rewardVault: addr("RewardVault") };
    console.log(`deployed locally: game ${C.game}, treasury ${C.treasury}, chips ${C.chip}`);
  }

  // ------------------------------------------------------------------- owner
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC, { timeout: 60_000 }) });
  let ownerFees = 0n;
  const ownerSend = async (hash: Hex) => {
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("owner transaction reverted");
    ownerFees += r.gasUsed * r.effectiveGasPrice;
    return r;
  };
  const chipsOf = async (a: Address) => balancesFromBatch(await read<bigint[]>(C.chip, chip1155Abi, "balanceOfBatch", [CHIP_IDS.map(() => a), [...CHIP_IDS]]));
  const escrowOf = (a: Address) => read<bigint>(C.game, rouletteGameAbi, "escrow", [a]);
  await ownerSend(await ownerWallet.writeContract({ address: C.treasury, abi: casinoTreasuryAbi, functionName: "deposit", value: MODE === "fork" ? parseEther("0.002") : parseEther("0.01"), account: owner, chain }));
  const ownerChips0 = chipUnits(await chipsOf(owner.address));
  const ownerEth0 = await pub.getBalance({ address: owner.address });
  ownerFees = 0n; // measured from here
  console.log(`owner ${owner.address} holds ${ownerChips0} chips after depositing`);
  if (ownerChips0 < ALLOWANCE) throw new Error("deposit minted too few chips for the test");

  // ------------------------------------------- seat + burner key (browser modules)
  const store = () => useAgentSeats.getState();
  const made = store().create({ name: "E2E agent", owner: owner.address, tableId: "1", rules: { bets: [{ betId: "red", stake: STAKE }], cadence: "every", maxRounds: MAX_ROUNDS, stopLoss: STOP_LOSS, stopWin: null, timeLimitMinutes: 30 }, allowance: ALLOWANCE, isPublic: false });
  if (!made.ok) throw new Error(made.error);
  const seatId = made.id;
  const key = createAgentKey(seatId, owner.address);
  store().attachWallet(seatId, key.address);
  const agent = key.address;
  const seat = () => store().seats[seatId];
  console.log(`agent wallet ${agent} created (its key stays in the in-memory keystore and is never printed)`);
  const secret = readAgentPrivateKey(seatId)!;
  check("the private key is not in the persisted seat JSON", !mem.get("agent-seats")!.toLowerCase().includes(secret.slice(2).toLowerCase()));
  check("the key has its own storage entry", mem.has(`${AGENT_KEY_PREFIX}${seatId}`));

  // ------------------------------------------- funding: two owner signatures
  await ownerSend(await ownerWallet.sendTransaction({ account: owner, chain, to: agent, value: GAS_FLOAT }));
  const sel = selectChips(await chipsOf(owner.address), ALLOWANCE);
  if (!sel.exact) throw new Error(`owner denominations cannot make ${ALLOWANCE}`);
  await ownerSend(await ownerWallet.writeContract({ address: C.chip, abi: chip1155Abi, functionName: "safeBatchTransferFrom", args: [owner.address, agent, sel.ids, sel.amounts, "0x"], account: owner, chain }));
  store().markFunded(seatId);
  store().approve(seatId);
  check("agent funded with the allowance and the gas float", chipUnits(await chipsOf(agent)) === ALLOWANCE && (await pub.getBalance({ address: agent })) === GAS_FLOAT);

  // ------------------------------------------------------------------ runner
  // Fee suggestions only: anvil answers eth_maxPriorityFeePerGas with 1 gwei, prices gas at
  // base + 1 gwei and implements eth_fillTransaction, about 50x what Robinhood Chain charges
  // (its RPC answered a 0x0 tip, ~0.02 gwei and "eth_fillTransaction does not exist" when
  // measured). The agent's clients get the mainnet-shaped answers; everything else is anvil's.
  const raw = http(RPC, { timeout: 60_000 })({ chain });
  const agentTransport = custom({
    request: async (args: { method: string; params?: unknown }) => {
      if (args.method === "eth_fillTransaction") throw Object.assign(new Error("the method eth_fillTransaction does not exist/is not available"), { code: -32601 });
      if (args.method === "eth_maxPriorityFeePerGas") return "0x0";
      if (args.method === "eth_gasPrice") return toHex(BASE_FEE);
      return raw.request(args as never);
    },
  });
  const agentPub = createPublicClient({ chain, transport: agentTransport, pollingInterval: 100 });
  const lines: string[] = [];
  const makeRunner = () => {
    const io = agentIOFor(seatId, { chain, contracts: C, publicClient: agentPub as never, transport: agentTransport });
    if (!io) throw new Error("agent I/O could not be created");
    return new AgentRunner({
      io,
      seat: storeSeatPort(seatId),
      owner: owner.address,
      tableId: 1,
      bettingWindowSeconds: BETTING_SECONDS,
      onStatus: (s) => {
        const line = `${s.phase} · ${s.note}${s.error ? ` [${s.error}]` : ""}`;
        if (lines.at(-1) !== line) {
          lines.push(line);
          console.log(`    agent: ${line}`);
        }
      },
    });
  };
  let runner = makeRunner();
  let running = true;
  const loop = (async () => {
    while (running) {
      const { again } = await runner.tick();
      if (!again) await sleep(300);
    }
  })();
  const until = async (what: string, cond: () => boolean | Promise<boolean>, ms = 60_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await cond()) return;
      await sleep(150);
    }
    throw new Error(`timeout waiting for ${what}`);
  };
  const agentBetsIn = async (id: bigint) => (await read<Array<{ player: Address }>>(C.game, rouletteGameAbi, "getBets", [id])).filter((b) => b.player.toLowerCase() === agent.toLowerCase()).length;
  let reloaded = false;
  const reload = async () => {
    // "Reload": the runner and everything it remembered are gone; a new one starts from the seat record and the chain.
    reloaded = true;
    runner = makeRunner();
    console.log("    (runner discarded and recreated mid-round)");
    await sleep(2500);
  };
  // Anvil mines on demand, so chain time and the reveal delay only move with blocks: keep them coming.
  const miner = setInterval(() => void test.mine({ blocks: 1 }).catch(() => {}), MODE === "fork" ? 1000 : 250);
  const played: bigint[] = [];

  if (MODE === "local") {
    // ------------------------------------------- the real operator, seated-only
    stateDir = mkdtempSync(join(tmpdir(), "agent-e2e-operator-"));
    const opProc = spawn("bun", ["run", "src/run-rounds.ts"], {
      cwd: join(ROOT, "agent", "operator"),
      env: { ...process.env, PATH, RPC_URL: RPC, CHAIN_ID: String(CHAIN_ID), GAME_ADDRESS: C.game, RANDOMNESS_ADDRESS: C.randomness, TABLE_IDS: "1", BETTING_SECONDS: String(BETTING_SECONDS), ROUND_GAP_SECONDS: "1", POLL_MS: "100", SEAT_POLL_MS: "500", STATE_DIR: stateDir, OPERATOR_PRIVATE_KEY: ANVIL.operator },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(opProc);
    const pump = (d: Buffer) => {
      for (const l of d.toString().split("\n")) if (l.trim()) operatorLog.push(l.trim());
    };
    opProc.stdout!.on("data", pump);
    opProc.stderr!.on("data", pump);
    console.log("operator (agent/operator/src/run-rounds.ts) started: it opens rounds only once someone has escrow");

    await until("the agent to enter the table", async () => (await escrowOf(agent)) === BigInt(ALLOWANCE));
    check("agent approved the treasury and escrowed its chips by itself", await read<boolean>(C.chip, chip1155Abi, "isApprovedForAll", [agent, C.treasury]));

    // Watch rounds as the operator opens them; reload the runner once, while a bet is in an open round.
    let next = 1n;
    const record = async (id: bigint): Promise<boolean> => {
      const r = await read<{ status: number; result: number }>(C.game, rouletteGameAbi, "getRound", [id]);
      if (r.status !== ROUND_STATUS.Settled && r.status !== ROUND_STATUS.Voided) return false;
      const mine = await agentBetsIn(id);
      if (mine > 0) {
        played.push(id);
        check(`round ${id}: exactly one bet from the agent`, mine === 1, r.status === ROUND_STATUS.Settled ? `result ${r.result}` : "voided");
        await until(`the agent to book round ${id}`, () => seat().chain?.pending?.roundId !== Number(id));
        console.log(`  round ${id}: ${r.status === ROUND_STATUS.Settled ? `result ${r.result}` : "voided"} · agent net ${seat().net}`);
      }
      return true;
    };
    while (seat().status === "active" || seat().chain?.pending) {
      if (!reloaded && played.length === 1 && seat().chain?.pending?.roundId === Number(next) && (await read<{ status: number }>(C.game, rouletteGameAbi, "getRound", [next])).status === ROUND_STATUS.Open) await reload();
      if (await record(next)) next += 1n;
      else await sleep(150);
      if (operatorLog.some((l) => /"level":"fatal"/.test(l))) throw new Error(`operator failed: ${operatorLog.slice(-3).join(" | ")}`);
    }
    while (await record(next)) next += 1n; // a round booked between two looks
    await until("the leash to stop the agent", () => seat().status === "stopped", 30_000);
    console.log(`  agent stopped by its leash: ${seat().stoppedReason}`);
  } else {
    // --------------------------------- fork: impersonated operator, rounds void at reveal
    const operatorRole = await read<Hex>(MAINNET.acl, accessControllerAbi, "OPERATOR_ROLE");
    let operator: Address | null = null;
    for (const a of OPERATOR_CANDIDATES) if (await read<boolean>(MAINNET.acl, accessControllerAbi, "hasRole", [operatorRole, a])) { operator = a; break; }
    if (!operator) throw new Error("no known address holds OPERATOR_ROLE on the fork");
    await test.impersonateAccount({ address: operator });
    await test.setBalance({ address: operator, value: parseEther("1") });
    const opWallet = createWalletClient({ account: operator, chain, transport: http(RPC, { timeout: 60_000 }) });
    const op = async (address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]) => {
      const hash = await opWallet.writeContract({ address, abi, functionName, args, account: operator!, chain } as never);
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`operator ${functionName} reverted`);
    };
    console.log(`operator ${operator} impersonated on the fork`);
    await until("the agent to enter the table", async () => (await escrowOf(agent)) === BigInt(ALLOWANCE));
    check("agent approved the treasury and escrowed its chips by itself", await read<boolean>(C.chip, chip1155Abi, "isApprovedForAll", [agent, C.treasury]));

    let roundId = 7_000_000n + BigInt(Math.floor(Math.random() * 100_000));
    for (let i = 0; i < 2; i++) {
      const id = ++roundId;
      const seed = keccak256(toHex(`fork-e2e-${id}`));
      await op(C.randomness, randomnessManagerAbi, "commit", [id, keccak256(seed)]);
      await op(C.game, rouletteGameAbi, "openRound", [id, 1]);
      await until(`the agent's bet in round ${id}`, async () => (await agentBetsIn(id)) > 0);
      check(`round ${id}: stake left the agent's escrow`, (await escrowOf(agent)) === BigInt(ALLOWANCE - STAKE));
      if (i === 0) await reload();
      await sleep(1200);
      check(`round ${id}: exactly one bet from the agent`, (await agentBetsIn(id)) === 1);
      await op(C.game, rouletteGameAbi, "closeRound", [id]);
      await test.mine({ blocks: 4 });
      await op(C.randomness, randomnessManagerAbi, "reveal", [id, seed]); // BLOCKHASH is zero on the fork → the randomness round is voided
      await op(C.game, rouletteGameAbi, "settleRound", [id]); // … and the game refunds every stake
      const r = await read<{ status: number }>(C.game, rouletteGameAbi, "getRound", [id]);
      check(`round ${id}: voided on the fork (reveal cannot read a block hash there)`, r.status === ROUND_STATUS.Voided, `status ${r.status}`);
      played.push(id);
      await until(`the agent to book round ${id}`, () => seat().chain?.pending == null);
      check(`round ${id}: agent booked the refund, not a result`, seat().net === 0 && (await escrowOf(agent)) === BigInt(ALLOWANCE));
    }
    // The owner's "Sweep back to my wallet".
    console.log("  owner presses Sweep");
    runner.requestSweep();
  }

  // ------------------------------------------------------ stop → leave → sweep
  await until("the sweep to finish", () => seat().chain?.sweptAt != null, 60_000);
  running = false;
  await loop;
  clearInterval(miner);

  // ----------------------------------------------------------- reconciliation
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  let expectedNet = 0;
  let settled = 0;
  for (const id of played) {
    const r = await read<{ status: number; result: number }>(C.game, rouletteGameAbi, "getRound", [id]);
    if (r.status !== ROUND_STATUS.Settled) continue;
    settled += 1;
    expectedNet += RED.has(r.result) ? STAKE : -STAKE;
  }
  const agentChips = chipUnits(await chipsOf(agent));
  const agentEscrow = await escrowOf(agent);
  const agentEth = await pub.getBalance({ address: agent });
  const ownerChips1 = chipUnits(await chipsOf(owner.address));
  const ownerEth1 = await pub.getBalance({ address: owner.address });

  // Every transaction the agent address sent, straight from the node's blocks.
  const head = await pub.getBlockNumber();
  let agentFees = 0n;
  const agentTxs: Array<{ fn: string; gasUsed: bigint }> = [];
  const selectors: Record<string, string> = { "0xa22cb465": "setApprovalForAll", "0x2eb2c2d6": "safeBatchTransferFrom" };
  for (let b = startBlock + 1n; b <= head; b++) {
    const block = await pub.getBlock({ blockNumber: b, includeTransactions: true });
    for (const t of block.transactions) {
      if (t.from.toLowerCase() !== agent.toLowerCase()) continue;
      const r = await pub.getTransactionReceipt({ hash: t.hash });
      agentFees += r.gasUsed * r.effectiveGasPrice;
      let fn = selectors[t.input.slice(0, 10)] ?? (t.input === "0x" ? "ETH transfer to owner" : t.input.slice(0, 10));
      if (t.to?.toLowerCase() === C.game.toLowerCase()) {
        const { decodeFunctionData } = await import("viem");
        fn = decodeFunctionData({ abi: rouletteGameAbi, data: t.input }).functionName;
      }
      agentTxs.push({ fn, gasUsed: r.gasUsed });
      if (r.status !== "success") check(`agent transaction ${t.hash.slice(0, 10)}… succeeded`, false);
      if (t.to && ![C.game, C.chip, owner.address].some((a) => a.toLowerCase() === t.to!.toLowerCase())) check(`agent only ever called the game, the chip contract or paid the owner`, false, t.to);
    }
  }
  console.log("  agent transactions, in order (gas used):");
  for (const t of agentTxs) console.log(`    ${t.fn.padEnd(24)} ${t.gasUsed}`);

  const count = (fn: string) => agentTxs.filter((t) => t.fn === fn).length;
  check("net and rounds in the seat record match the chain", seat().net === expectedNet && seat().roundsPlayed === settled, `net ${seat().net} (chain ${expectedNet}), rounds ${seat().roundsPlayed} (chain ${settled})`);
  check("every bet trace carries a transaction hash and the round's commitment", seat().traces.filter((t) => t.decision.startsWith("BET")).every((t) => /^0x[0-9a-f]{64}$/.test(t.tx ?? "") && /^0x[0-9a-f]{64}$/.test(t.commitment ?? "")));
  check("the runner was recreated mid-round and still bet each round once", reloaded && count("placeBets") === played.length, `${count("placeBets")} placeBets for ${played.length} rounds`);
  check("one setApprovalForAll, one enterTable, one leaveTable, one chip transfer, one ETH transfer", count("setApprovalForAll") === 1 && count("enterTable") === 1 && count("leaveTable") === 1 && count("safeBatchTransferFrom") === 1 && count("ETH transfer to owner") === 1 && agentTxs.length === played.length + 5, `${agentTxs.length} transactions`);
  check("agent address holds no chips", agentChips === 0, `${agentChips}`);
  check("agent address has no escrow", agentEscrow === 0n, `${agentEscrow}`);
  check("agent address holds no more ETH than dust", agentEth <= ETH_DUST_WEI, `${agentEth} wei left`);
  check("owner got back the allowance plus the net result, in chips", ownerChips1 === ownerChips0 + expectedNet, `${ownerChips0} → ${ownerChips1}, net ${expectedNet}`);
  check("owner ETH reconciles to the wei: start − owner gas − agent gas − agent dust", ownerEth1 === ownerEth0 - ownerFees - agentFees - agentEth, `float ${GAS_FLOAT} wei, agent gas ${agentFees} wei, returned ${GAS_FLOAT - agentFees - agentEth} wei`);
  if (MODE === "local") check("the leash stopped the agent (round cap or stop-loss)", ["Reached the round limit.", "Stop-loss reached."].includes(seat().stoppedReason ?? ""), seat().stoppedReason ?? "");
  else check("the owner's sweep stopped the agent", seat().stoppedReason === "Swept back by owner.", seat().stoppedReason ?? "");

  // Key deletion is refused with funds and allowed once the address is empty.
  check("deleting the key is refused while funds are reported", deleteAgentKey(seatId, { chipUnits: 1, escrow: 0n, winBalance: 0n, eth: 0n }).ok === false && getAgentKeyInfo(seatId) !== null);
  check("deleting the key succeeds for the empty address", deleteAgentKey(seatId, { chipUnits: agentChips, escrow: agentEscrow, winBalance: 0n, eth: agentEth }).ok === true && getAgentKeyInfo(seatId) === null);
}

main()
  .catch(async (e) => {
    console.error(e);
    const { useAgentSeats } = await import("@/store/agent-seat");
    for (const s of Object.values(useAgentSeats.getState().seats)) for (const l of s.log.slice(-8)) console.log(`    seat log: ${l.text}`);
    for (const l of operatorLog.slice(-6)) console.log(`    operator: ${l.slice(0, 300)}`);
    check("script completed", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
  })
  .finally(() => {
    for (const c of children) c.kill();
    if (stateDir) rmSync(stateDir, { recursive: true, force: true });
    const failed = checks.filter(([, ok]) => !ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (mode ${MODE})`);
    process.exit(failed.length ? 1 : 0);
  });
