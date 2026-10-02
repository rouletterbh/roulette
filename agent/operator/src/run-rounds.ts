/**
 * Round operator: drives the onchain roulette lifecycle for one or more tables with the OPERATOR key.
 *
 *   RandomnessManager.commit(roundId, keccak256(seed))   operator
 *   RouletteGame.openRound(roundId, tableId)              operator
 *   ... players placeBets for BETTING_SECONDS ...
 *   RouletteGame.closeRound(roundId)                      operator  (locks playerSeed on the randomness source)
 *   ... wait until block.number > revealAfterBlock ...
 *   RandomnessManager.reveal(roundId, seed)               operator  (derives result; voids if the blockhash is gone)
 *   RouletteGame.settleRound(roundId)                     anyone    (pays winners, or refunds when randomness is Void)
 *
 * No-bet rounds take the single-transaction `cancelRound` path by default (EMPTY_ROUND_POLICY=cancel) instead
 * of close+reveal+settle (EMPTY_ROUND_POLICY=settle). A locked round whose reveal window expired (256 blocks
 * after revealAfterBlock) is refunded with `voidRound`.
 *
 * Every decision is taken from CHAIN state, not from the local file: the state file is only there to keep the
 * server seed (without it a locked round can never be revealed) and the round counter across restarts. The
 * record is persisted BEFORE the commit transaction is sent, so a crash at any point resumes cleanly.
 *
 * Env: RPC_URL, CHAIN_ID (4663|46630|31337), GAME_ADDRESS, RANDOMNESS_ADDRESS, OPERATOR_PRIVATE_KEY (optional with --dry-run)
 * Optional: TABLE_IDS ("1"), BETTING_SECONDS (20), ROUND_GAP_SECONDS (3), EMPTY_ROUND_POLICY (cancel|settle),
 *           MAX_ROUNDS (0 = forever; also --rounds=N), ACL_ADDRESS (default: game.ACL()), STATE_DIR (./state),
 *           POLL_MS (1000), TX_TIMEOUT_MS (120000), MAX_BACKOFF_MS (30000)
 * Flags: --dry-run (verify config + roles, print the plan, send nothing), --rounds=N
 *
 * Safety: never sends when --dry-run; fails fast when the key lacks OPERATOR_ROLE, when CHAIN_ID does not match
 * the RPC, or when GAME.RANDOMNESS() != RANDOMNESS_ADDRESS. SIGINT once = finish in-flight rounds then exit,
 * twice = exit now (state is on disk; the next start resumes).
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  concatHex,
  hexToBigInt,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import gameAbiJson from "../abi/RouletteGame.json";
import randomnessAbiJson from "../abi/RandomnessManager.json";
import aclAbiJson from "../abi/AccessController.json";

const gameAbi = gameAbiJson as Abi;
const randomnessAbi = randomnessAbiJson as Abi;
const aclAbi = aclAbiJson as Abi;

// ------------------------------------------------------------------ config

const dry = process.argv.includes("--dry-run");
const roundsArg = process.argv.find((a) => a.startsWith("--rounds="))?.split("=")[1];
const rpc = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const chainId = Number(process.env.CHAIN_ID ?? 4663);
const chain = defineChain({
  id: chainId,
  name: chainId === 4663 ? "Robinhood Chain" : chainId === 46630 ? "Robinhood Chain Testnet" : `chain-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const gameAddress = requireAddress("GAME_ADDRESS");
const randomnessAddress = requireAddress("RANDOMNESS_ADDRESS");
const tableIds = (process.env.TABLE_IDS ?? "1").split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
const bettingMs = Number(process.env.BETTING_SECONDS ?? 20) * 1000;
const gapMs = Number(process.env.ROUND_GAP_SECONDS ?? 3) * 1000;
const emptyPolicy = (process.env.EMPTY_ROUND_POLICY ?? "cancel") as "cancel" | "settle";
const maxRounds = Number(roundsArg ?? process.env.MAX_ROUNDS ?? 0);
const pollMs = Number(process.env.POLL_MS ?? 1000);
const txTimeoutMs = Number(process.env.TX_TIMEOUT_MS ?? 120_000);
const maxBackoffMs = Number(process.env.MAX_BACKOFF_MS ?? 30_000);
const stateDir = resolve(process.env.STATE_DIR ?? join(import.meta.dir, "..", "state"));
const roundsFile = join(stateDir, "rounds.json");
const statusFile = join(stateDir, "status.json");
const BLOCKHASH_WINDOW = 256n;
const PAUSE_GAMEPLAY = 2;

if (!["cancel", "settle"].includes(emptyPolicy)) throw new Error(`EMPTY_ROUND_POLICY must be cancel|settle`);
if (!tableIds.length) throw new Error("TABLE_IDS must list at least one table id");

function requireAddress(name: string): Address {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} must be a 0x address (got ${v ?? "unset"})`);
  return v as Address;
}

// ------------------------------------------------------------------ logging

type Fields = Record<string, unknown>;
const json = (o: unknown) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
function log(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const line = json({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

// -------------------------------------------------------------------- state

type Stage = "planned" | "committed" | "open" | "closed" | "revealed" | "settled" | "cancelled" | "voided";
const TERMINAL: Stage[] = ["settled", "cancelled", "voided"];

interface RoundRecord {
  roundId: string;
  tableId: number;
  seed: Hex;
  commitment: Hex;
  stage: Stage;
  createdAt: string;
  updatedAt: string;
  closesAt?: number; // ms epoch (local clock) when the betting window ends
  revealAfterBlock?: string;
  betCount?: number;
  result?: number;
  txs: Partial<Record<string, Hex>>;
}

interface State {
  version: 1;
  nextRoundId: string;
  rounds: Record<string, RoundRecord>;
}

interface TableStatus {
  roundId: string | null;
  stage: Stage | "idle";
  closesAt: number | null;
  revealAfterBlock: string | null;
  betCount: number | null;
  lastResult: { roundId: string; result: number; tx: Hex | null; block: string | null; at: string } | null;
}

interface Status {
  updatedAt: string;
  chainId: number;
  operator: Address | null;
  game: Address;
  randomness: Address;
  bettingSeconds: number;
  emptyRoundPolicy: string;
  stopping: boolean;
  tables: Record<string, TableStatus>;
  recent: Array<{ roundId: string; tableId: number; result: number | null; stage: Stage; at: string }>;
}

function loadState(): State {
  if (!existsSync(roundsFile)) return { version: 1, nextRoundId: "1", rounds: {} };
  const s = JSON.parse(readFileSync(roundsFile, "utf8")) as State;
  if (s.version !== 1) throw new Error(`unsupported state version in ${roundsFile}`);
  return s;
}

function atomicWrite(file: string, data: string) {
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

const state = loadState();
function saveState() {
  // keep the file small: drop terminal rounds beyond the most recent 200
  const done = Object.values(state.rounds).filter((r) => TERMINAL.includes(r.stage)).sort((a, b) => Number(b.roundId) - Number(a.roundId));
  for (const r of done.slice(200)) delete state.rounds[r.roundId];
  atomicWrite(roundsFile, json(state));
}

const status: Status = {
  updatedAt: new Date().toISOString(),
  chainId,
  operator: null,
  game: gameAddress,
  randomness: randomnessAddress,
  bettingSeconds: bettingMs / 1000,
  emptyRoundPolicy: emptyPolicy,
  stopping: false,
  tables: {},
  recent: [],
};
function tableStatus(tableId: number): TableStatus {
  return (status.tables[tableId] ??= { roundId: null, stage: "idle", closesAt: null, revealAfterBlock: null, betCount: null, lastResult: null });
}
function publishStatus(rec?: RoundRecord, extra: Partial<TableStatus> = {}) {
  if (rec) {
    const t = tableStatus(rec.tableId);
    t.roundId = rec.roundId;
    t.stage = rec.stage;
    t.closesAt = rec.closesAt ?? null;
    t.revealAfterBlock = rec.revealAfterBlock ?? null;
    t.betCount = rec.betCount ?? null;
    Object.assign(t, extra);
    if (TERMINAL.includes(rec.stage)) {
      if (rec.stage === "settled" && rec.result !== undefined) {
        t.lastResult = { roundId: rec.roundId, result: rec.result, tx: rec.txs.settle ?? null, block: null, at: new Date().toISOString() };
      }
      status.recent.unshift({ roundId: rec.roundId, tableId: rec.tableId, result: rec.result ?? null, stage: rec.stage, at: new Date().toISOString() });
      status.recent = status.recent.slice(0, 20);
    }
  }
  status.stopping = stopping;
  status.updatedAt = new Date().toISOString();
  if (!dry) atomicWrite(statusFile, json(status));
}

function setStage(rec: RoundRecord, stage: Stage, fields: Partial<RoundRecord> = {}) {
  Object.assign(rec, fields, { stage, updatedAt: new Date().toISOString() });
  state.rounds[rec.roundId] = rec;
  saveState();
  publishStatus(rec);
}

// ------------------------------------------------------------------- clients

const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: pollMs });
const pk = process.env.OPERATOR_PRIVATE_KEY as Hex | undefined;
if (!pk && !dry) throw new Error("OPERATOR_PRIVATE_KEY required (or use --dry-run)");
const account = pk ? privateKeyToAccount(pk) : null;
const wallet = account ? createWalletClient({ account, chain, transport: http(rpc) }) : null;
status.operator = account?.address ?? null;

// Contract enums (RouletteGame.RoundStatus / IRandomnessSource.RoundStatus)
const G = { None: 0, Open: 1, Closed: 2, Settled: 3, Voided: 4 } as const;
const R = { None: 0, Committed: 1, Locked: 2, Revealed: 3, Void: 4 } as const;

interface GameRound { tableId: number; status: number; result: number; betCount: number; openedAt: bigint; totalStaked: bigint; totalReturned: bigint; reservedUnits: bigint; playerSeed: Hex }
interface RmRound { commitment: Hex; playerSeed: Hex; serverSeed: Hex; blockRef: Hex; revealAfterBlock: bigint; committedAtBlock: bigint; result: number; status: number }

const gameRound = (id: bigint) => pub.readContract({ address: gameAddress, abi: gameAbi, functionName: "getRound", args: [id] }) as Promise<GameRound>;
const rmRound = (id: bigint) => pub.readContract({ address: randomnessAddress, abi: randomnessAbi, functionName: "getRound", args: [id] }) as Promise<RmRound>;

// Only one transaction in flight at a time across all tables: the wallet fetches the pending nonce per send,
// so serialising sends is what keeps nonces monotonic without tracking them by hand.
let txChain: Promise<unknown> = Promise.resolve();
function sendTx(label: string, rec: RoundRecord, req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) {
  const run = async () => {
    if (!wallet) throw new Error("no wallet (dry run)");
    const hash = await wallet.writeContract({ ...req, account: wallet.account, chain });
    rec.txs[label] = hash;
    saveState();
    log("info", `tx.sent`, { roundId: rec.roundId, tableId: rec.tableId, fn: req.functionName, tx: hash });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: txTimeoutMs });
    if (receipt.status !== "success") throw new Error(`${req.functionName} reverted onchain (tx ${hash})`);
    return { hash, block: receipt.blockNumber };
  };
  const p = txChain.then(run, run);
  txChain = p.catch(() => undefined);
  return p;
}

/** If a previous attempt already broadcast this step, wait for that hash before re-deciding. */
async function settlePending(rec: RoundRecord, label: string) {
  const hash = rec.txs[label];
  if (!hash) return;
  try {
    await pub.waitForTransactionReceipt({ hash, timeout: Math.min(txTimeoutMs, 30_000) });
  } catch {
    log("warn", "tx.pending.unknown", { roundId: rec.roundId, fn: label, tx: hash });
  }
}

function describeError(e: unknown): Fields {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    return { error: e.shortMessage, revert: revert?.data?.errorName, revertArgs: revert?.data?.args?.map(String) };
  }
  return { error: (e as Error).message ?? String(e) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(maxBackoffMs, 1000 * 2 ** Math.min(attempt - 1, 10)) + Math.floor(Math.random() * 250);

// ---------------------------------------------------------------- shutdown

let stopping = false;
let sigints = 0;
process.on("SIGINT", () => {
  sigints++;
  if (sigints === 1) {
    stopping = true;
    log("warn", "shutdown.requested", { note: "finishing in-flight rounds; press Ctrl-C again to exit immediately" });
    publishStatus();
  } else {
    log("warn", "shutdown.forced", { note: "state persisted; the next start resumes any in-flight round" });
    process.exit(130);
  }
});
process.on("SIGTERM", () => {
  stopping = true;
  log("warn", "shutdown.requested", { signal: "SIGTERM" });
  publishStatus();
});

// -------------------------------------------------------------- startup checks

async function verifyEnvironment() {
  const rpcChainId = await pub.getChainId();
  if (rpcChainId !== chainId) throw new Error(`CHAIN_ID=${chainId} but RPC reports chain ${rpcChainId}`);
  const wiredRandomness = (await pub.readContract({ address: gameAddress, abi: gameAbi, functionName: "RANDOMNESS" })) as Address;
  if (wiredRandomness.toLowerCase() !== randomnessAddress.toLowerCase()) {
    throw new Error(`RouletteGame.RANDOMNESS() is ${wiredRandomness}, RANDOMNESS_ADDRESS is ${randomnessAddress}`);
  }
  const acl = (process.env.ACL_ADDRESS as Address | undefined) ?? ((await pub.readContract({ address: gameAddress, abi: gameAbi, functionName: "ACL" })) as Address);
  const operatorRole = (await pub.readContract({ address: acl, abi: aclAbi, functionName: "OPERATOR_ROLE" })) as Hex;
  if (account) {
    const ok = (await pub.readContract({ address: acl, abi: aclAbi, functionName: "hasRole", args: [operatorRole, account.address] })) as boolean;
    if (!ok) {
      throw new Error(
        `${account.address} does NOT hold OPERATOR_ROLE on AccessController ${acl} (chain ${chainId}). ` +
          `An ADMIN must call grantRole(OPERATOR_ROLE, ${account.address}). Note Deploy.s.sol revokes the deployer's OPERATOR_ROLE after creating table 1, so OPERATOR == deployer ends up WITHOUT the role.`,
      );
    }
    const balance = await pub.getBalance({ address: account.address });
    if (balance < 10n ** 15n) log("warn", "operator.lowBalance", { address: account.address, wei: balance });
  } else {
    log("warn", "operator.noKey", { note: "dry run without OPERATOR_PRIVATE_KEY: role check skipped" });
  }
  const revealDelay = (await pub.readContract({ address: randomnessAddress, abi: randomnessAbi, functionName: "revealDelayBlocks" })) as bigint;
  const paused = (await pub.readContract({ address: gameAddress, abi: gameAbi, functionName: "isPaused", args: [PAUSE_GAMEPLAY] })) as boolean;
  if (paused) log("warn", "game.paused", { note: "PAUSE_GAMEPLAY is set; openRound will revert until an ADMIN unpauses" });
  for (const t of tableIds) {
    const [minStake, maxStake, isPrivate, active] = (await pub.readContract({ address: gameAddress, abi: gameAbi, functionName: "tables", args: [t] })) as [bigint, bigint, boolean, boolean];
    if (!active) throw new Error(`table ${t} is not active on ${gameAddress}`);
    log("info", "table.ok", { tableId: t, minStake, maxStake, isPrivate });
  }
  log("info", "startup.ok", { chainId, rpc, operator: account?.address ?? null, acl, game: gameAddress, randomness: randomnessAddress, revealDelayBlocks: revealDelay, bettingSeconds: bettingMs / 1000, tables: tableIds, emptyRoundPolicy: emptyPolicy, dryRun: dry, stateDir });
}

// -------------------------------------------------------------- round planning

let planChain: Promise<unknown> = Promise.resolve();
/** Allocate the next unused roundId (persisted counter, bumped past anything already committed onchain). */
function planRound(tableId: number): Promise<RoundRecord> {
  const run = async () => {
    let id = BigInt(state.nextRoundId);
    if (id < 1n) id = 1n;
    for (;;) {
      const [rm, g] = await Promise.all([rmRound(id), gameRound(id)]);
      if (rm.status === R.None && g.status === G.None && !state.rounds[id.toString()]) break;
      if (rm.status !== R.None || g.status !== G.None) log("warn", "roundId.skip", { roundId: id, reason: "already used onchain" });
      id++;
    }
    const seedBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(seedBytes);
    const seed = toHex(seedBytes);
    const rec: RoundRecord = {
      roundId: id.toString(),
      tableId,
      seed,
      commitment: keccak256(seed), // == keccak256(abi.encodePacked(bytes32 seed))
      stage: "planned",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      txs: {},
    };
    state.nextRoundId = (id + 1n).toString();
    if (!dry) setStage(rec, "planned"); // persisted BEFORE commit is sent: the seed must survive a crash
    return rec;
  };
  const p = planChain.then(run, run);
  planChain = p.catch(() => undefined);
  return p;
}

// --------------------------------------------------------------- state machine

/** One decision, taken from chain state. Returns true when the round is terminal. */
async function step(rec: RoundRecord): Promise<boolean> {
  const id = BigInt(rec.roundId);
  const [rm, g] = await Promise.all([rmRound(id), gameRound(id)]);
  const base = { roundId: rec.roundId, tableId: rec.tableId };

  if (g.status === G.Settled) {
    if (rec.stage !== "settled") {
      setStage(rec, "settled", { result: g.result, betCount: g.betCount });
      log("info", "round.settled", { ...base, result: g.result, betCount: g.betCount, totalStaked: g.totalStaked, totalReturned: g.totalReturned, tx: rec.txs.settle ?? null });
    }
    return true;
  }
  if (g.status === G.Voided) {
    const stage: Stage = rm.status === R.Committed ? "cancelled" : "voided";
    if (rec.stage !== stage) {
      setStage(rec, stage, { betCount: g.betCount });
      log("info", `round.${stage}`, { ...base, refundedUnits: g.totalReturned, betCount: g.betCount, tx: rec.txs.cancel ?? rec.txs.void ?? rec.txs.settle ?? null });
    }
    return true;
  }

  // 1. commit
  if (rm.status === R.None) {
    if (dry) {
      log("info", "plan", { ...base, commitment: rec.commitment, steps: ["commit", "openRound", `bet window ${bettingMs / 1000}s`, emptyPolicy === "cancel" ? "closeRound | cancelRound(if betCount==0)" : "closeRound", "wait block > revealAfterBlock", "reveal", "settleRound"], note: "dry run: nothing sent" });
      return true;
    }
    await settlePending(rec, "commit");
    if ((await rmRound(id)).status !== R.None) return false;
    const { hash, block } = await sendTx("commit", rec, { address: randomnessAddress, abi: randomnessAbi, functionName: "commit", args: [id, rec.commitment] });
    setStage(rec, "committed");
    log("info", "round.committed", { ...base, commitment: rec.commitment, tx: hash, block });
    return false;
  }

  // 2. open
  if (rm.status === R.Committed && g.status === G.None) {
    if (stopping && rec.stage === "committed") {
      // Nothing is at stake yet (no bets can exist before openRound). Leave the commitment unused and stop.
      log("warn", "round.abandonedCommitted", { ...base, note: "shutdown before openRound; roundId stays consumed, will reopen on next start" });
      return true;
    }
    await settlePending(rec, "open");
    if ((await gameRound(id)).status !== G.None) return false;
    const { hash, block } = await sendTx("open", rec, { address: gameAddress, abi: gameAbi, functionName: "openRound", args: [id, rec.tableId] });
    setStage(rec, "open", { closesAt: Date.now() + bettingMs });
    log("info", "round.opened", { ...base, tx: hash, block, closesAt: new Date(rec.closesAt!).toISOString() });
    return false;
  }

  // 3. betting window, then close (or cancel when empty)
  if (g.status === G.Open) {
    if (rec.stage !== "open") setStage(rec, "open");
    const closesAt = rec.closesAt ?? Math.max(Date.now(), Number(g.openedAt) * 1000 + bettingMs);
    if (rec.closesAt === undefined) setStage(rec, "open", { closesAt });
    if (Date.now() < closesAt) {
      await sleep(Math.min(pollMs, closesAt - Date.now()));
      return false;
    }
    await settlePending(rec, "close");
    await settlePending(rec, "cancel");
    const fresh = await gameRound(id);
    if (fresh.status !== G.Open) return false;
    if (fresh.betCount === 0 && emptyPolicy === "cancel") {
      const { hash, block } = await sendTx("cancel", rec, { address: gameAddress, abi: gameAbi, functionName: "cancelRound", args: [id] });
      setStage(rec, "cancelled", { betCount: 0 });
      log("info", "round.cancelled", { ...base, reason: "no bets", tx: hash, block });
      return false;
    }
    const { hash, block } = await sendTx("close", rec, { address: gameAddress, abi: gameAbi, functionName: "closeRound", args: [id] });
    const locked = await rmRound(id);
    setStage(rec, "closed", { betCount: fresh.betCount, revealAfterBlock: locked.revealAfterBlock.toString() });
    log("info", "round.closed", { ...base, betCount: fresh.betCount, totalStaked: fresh.totalStaked, revealAfterBlock: locked.revealAfterBlock, tx: hash, block });
    return false;
  }

  // 4. reveal / void / settle
  if (g.status === G.Closed) {
    if (rm.status === R.Locked) {
      const target = rm.revealAfterBlock;
      const bn = await pub.getBlockNumber();
      if (bn > target + BLOCKHASH_WINDOW) {
        // blockhash(revealAfterBlock) is gone: reveal would void anyway; voidRound = markVoid + refund in one tx
        await settlePending(rec, "void");
        if ((await gameRound(id)).status !== G.Closed) return false;
        const { hash, block } = await sendTx("void", rec, { address: gameAddress, abi: gameAbi, functionName: "voidRound", args: [id] });
        setStage(rec, "voided");
        log("error", "round.voided", { ...base, reason: "reveal window expired", revealAfterBlock: target, atBlock: block, tx: hash });
        return false;
      }
      if (bn <= target) {
        if (rec.stage !== "closed") setStage(rec, "closed", { revealAfterBlock: target.toString() });
        await sleep(pollMs);
        return false;
      }
      await settlePending(rec, "reveal");
      if ((await rmRound(id)).status !== R.Locked) return false;
      const { hash, block } = await sendTx("reveal", rec, { address: randomnessAddress, abi: randomnessAbi, functionName: "reveal", args: [id, rec.seed] });
      const after = await rmRound(id);
      if (after.status === R.Void) {
        log("error", "round.revealVoided", { ...base, note: "blockhash unavailable at reveal; settleRound will refund", tx: hash, block });
        return false;
      }
      // local re-derivation, identical to commit-reveal.ts / RandomnessManager.deriveResult
      const local = Number(hexToBigInt(keccak256(concatHex([rec.seed, after.playerSeed, after.blockRef, toHex(id, { size: 32 })]))) % 37n);
      setStage(rec, "revealed", { result: after.result });
      log(local === after.result ? "info" : "error", "round.revealed", { ...base, result: after.result, localResult: local, blockRef: after.blockRef, revealAfterBlock: target, tx: hash, block });
      return false;
    }
    if (rm.status === R.Revealed || rm.status === R.Void) {
      await settlePending(rec, "settle");
      if ((await gameRound(id)).status !== G.Closed) return false;
      const { hash, block } = await sendTx("settle", rec, { address: gameAddress, abi: gameAbi, functionName: "settleRound", args: [id] });
      log("info", "tx.settled", { ...base, tx: hash, block, randomness: rm.status === R.Void ? "void->refund" : "revealed" });
      return false; // next step records settled/voided from chain
    }
    throw new Error(`round ${rec.roundId}: game Closed but randomness status ${rm.status} (expected Locked/Revealed/Void)`);
  }

  throw new Error(`round ${rec.roundId}: unexpected combination game=${g.status} randomness=${rm.status}`);
}

async function driveRound(rec: RoundRecord) {
  let attempt = 0;
  for (;;) {
    try {
      if (await step(rec)) return;
      attempt = 0;
    } catch (e) {
      attempt++;
      const delay = backoff(attempt);
      log("error", "step.failed", { roundId: rec.roundId, tableId: rec.tableId, stage: rec.stage, attempt, retryInMs: delay, ...describeError(e) });
      await sleep(delay);
    }
  }
}

async function runTable(tableId: number) {
  let played = 0;
  // resume anything in flight for this table first (oldest first)
  const inflight = Object.values(state.rounds).filter((r) => r.tableId === tableId && !TERMINAL.includes(r.stage)).sort((a, b) => Number(a.roundId) - Number(b.roundId));
  for (const rec of inflight) {
    log("warn", "round.resume", { roundId: rec.roundId, tableId, stage: rec.stage });
    await driveRound(rec);
    played++;
  }
  while (!stopping && (maxRounds === 0 || played < maxRounds)) {
    const rec = await planRound(tableId);
    log("info", "round.planned", { roundId: rec.roundId, tableId, commitment: rec.commitment });
    await driveRound(rec);
    played++;
    if (dry) break;
    if (gapMs > 0 && !stopping) await sleep(gapMs);
  }
  tableStatus(tableId).stage = "idle";
  publishStatus();
  log("info", "table.done", { tableId, rounds: played, stopping });
}

// --------------------------------------------------------------------- main

await verifyEnvironment();
publishStatus();

// In-flight rounds on tables that are no longer configured still get finished (escrow must never be stranded).
const orphans = Object.values(state.rounds).filter((r) => !tableIds.includes(r.tableId) && !TERMINAL.includes(r.stage));
const work = [...tableIds.map(runTable), ...orphans.map((r) => (log("warn", "round.resumeOrphan", { roundId: r.roundId, tableId: r.tableId, stage: r.stage }), driveRound(r)))];
await Promise.all(work);
log("info", "operator.exit", { stopping, dryRun: dry });
