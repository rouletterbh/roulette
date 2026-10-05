import { isAddress, isHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Agent burner keys. One secp256k1 key per agent seat, generated in this browser and
 * kept ONLY in localStorage, each in its own entry (never inside the zustand-persisted
 * seat record, so no export, analytics event or seat JSON can carry it). Nothing in
 * this module sends, logs or serialises a key anywhere else.
 *
 * What that means for the owner, stated plainly in the UI:
 *   - anyone with access to this browser profile can read the key and move what the
 *     agent wallet holds (never more than the chips and gas sent to it);
 *   - clearing site data deletes the key, so funds must be swept back first;
 *   - deletion here is refused while the address still holds anything.
 */
export const AGENT_KEY_PREFIX = "agent-wallet-key:";

/** Below this the agent address is considered empty of ETH (it cannot pay for its own transfer). */
export const ETH_DUST_WEI = 5_000_000_000_000n; // 0.000005 ETH

export interface AgentKeyInfo {
  seatId: string;
  address: Address;
  /** Wallet that funded the agent; the only destination a sweep ever uses. */
  owner: Address;
  createdAt: number;
}

interface StoredKey extends AgentKeyInfo {
  privateKey: Hex;
}

export type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** What an agent address still holds, read from chain. */
export interface AgentHoldings {
  chipUnits: number;
  escrow: bigint;
  winBalance: bigint;
  eth: bigint;
}

export function browserKeyStorage(): KeyStorage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // storage blocked (private mode / policy)
  }
}

const entry = (seatId: string) => `${AGENT_KEY_PREFIX}${seatId}`;

function read(seatId: string, storage: KeyStorage | null): StoredKey | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(entry(seatId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredKey>;
    if (!v.privateKey || !isHex(v.privateKey) || v.privateKey.length !== 66) return null;
    if (!v.address || !isAddress(v.address) || !v.owner || !isAddress(v.owner)) return null;
    // The stored address must be the key's own address; a mismatch means the entry was tampered with.
    if (privateKeyToAccount(v.privateKey).address.toLowerCase() !== v.address.toLowerCase()) return null;
    return { seatId, address: v.address, owner: v.owner, createdAt: Number(v.createdAt ?? 0), privateKey: v.privateKey };
  } catch {
    return null;
  }
}

const info = (k: StoredKey): AgentKeyInfo => ({ seatId: k.seatId, address: k.address, owner: k.owner, createdAt: k.createdAt });

/** Create the seat's key, or return the existing one (never overwrites: an existing key may hold funds). */
export function createAgentKey(seatId: string, owner: Address, storage: KeyStorage | null = browserKeyStorage()): AgentKeyInfo {
  if (!storage) throw new Error("This browser does not allow site storage, so an agent wallet cannot be kept here.");
  const existing = read(seatId, storage);
  if (existing) return info(existing);
  const privateKey = generatePrivateKey();
  const record: StoredKey = { seatId, address: privateKeyToAccount(privateKey).address, owner, createdAt: Date.now(), privateKey };
  storage.setItem(entry(seatId), JSON.stringify(record));
  // Read back: if the write did not stick (quota, blocked storage) nobody may fund this address.
  const check = read(seatId, storage);
  if (!check || check.address !== record.address) throw new Error("The agent wallet could not be saved in this browser. Nothing was funded.");
  return info(record);
}

/** Address, owner and age of a seat's key. Never the key itself. */
export function getAgentKeyInfo(seatId: string, storage: KeyStorage | null = browserKeyStorage()): AgentKeyInfo | null {
  const k = read(seatId, storage);
  return k ? info(k) : null;
}

/** Every agent key in this browser (including ones whose seat record is gone). */
export function listAgentKeys(storage: KeyStorage | null = browserKeyStorage()): AgentKeyInfo[] {
  if (!storage) return [];
  const out: AgentKeyInfo[] = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (!name?.startsWith(AGENT_KEY_PREFIX)) continue;
    const k = read(name.slice(AGENT_KEY_PREFIX.length), storage);
    if (k) out.push(info(k));
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The raw private key. Two callers only: the in-browser signer (signer.ts) and the
 * owner's explicit "Export key" action. Never pass the result to a logger, a store
 * or a network request.
 */
export function readAgentPrivateKey(seatId: string, storage: KeyStorage | null = browserKeyStorage()): Hex | null {
  return read(seatId, storage)?.privateKey ?? null;
}

export function holdsFunds(h: AgentHoldings): boolean {
  return h.chipUnits > 0 || h.escrow > 0n || h.winBalance > 0n || h.eth > ETH_DUST_WEI;
}

/** Why the key may not be deleted yet, or null when the address is empty. */
export function deletionBlocker(h: AgentHoldings | null): string | null {
  if (!h) return "The agent wallet's balances could not be read, so the key is kept. Try again when Robinhood Chain is reachable.";
  if (h.escrow > 0n) return `The agent still has ${h.escrow.toString()} chips in escrow at the table. Sweep them back first.`;
  if (h.chipUnits > 0) return `The agent wallet still holds ${h.chipUnits} chips. Sweep them back first.`;
  if (h.winBalance > 0n) return "The agent address still has a win balance in the reward vault. Export the key to claim it before deleting.";
  if (h.eth > ETH_DUST_WEI) return "The agent wallet still holds ETH. Sweep it back first.";
  return null;
}

/**
 * Delete a seat's key. Refused unless `holdings` is a fresh chain read showing the
 * address holds no chips, no escrow, no win balance and no more ETH than dust.
 */
export function deleteAgentKey(seatId: string, holdings: AgentHoldings | null, storage: KeyStorage | null = browserKeyStorage()): { ok: true } | { ok: false; reason: string } {
  if (!storage) return { ok: false, reason: "Site storage is not available." };
  const reason = deletionBlocker(holdings);
  if (reason) return { ok: false, reason };
  storage.removeItem(entry(seatId));
  return { ok: true };
}
