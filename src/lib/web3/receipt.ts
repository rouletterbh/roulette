import type { Hex } from "viem";

/**
 * Wait for a transaction receipt with ONE light request per tick.
 *
 * viem/wagmi `waitForTransactionReceipt` re-checks on every block it missed between polls and
 * probes for replacements with full-block fetches. Robinhood Chain mints ~10 blocks a second, so a
 * 4 s poll fans out into dozens of concurrent RPC calls per wait; on the public RPC that stalled
 * the "Confirming…" step even though the transaction had been mined (seen on mainnet 2026-10-05).
 */
export interface ReceiptLike {
  status: "success" | "reverted";
}

export type ReceiptOutcome = { kind: "receipt"; status: "success" | "reverted" } | { kind: "timeout"; known: boolean };

export interface PollReceiptOptions {
  /** Returns the receipt, or throws / returns null while it is not available yet. */
  getReceipt: (hash: Hex) => Promise<ReceiptLike | null | undefined>;
  /** True when the node knows the transaction (pending or mined). Used only after a timeout. */
  isKnown: (hash: Hex) => Promise<boolean>;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const RECEIPT_TIMEOUT_MS = 90_000;
export const RECEIPT_POLL_MS = 1_500;

export async function pollReceipt(hash: Hex, o: PollReceiptOptions): Promise<ReceiptOutcome> {
  const timeoutMs = o.timeoutMs ?? RECEIPT_TIMEOUT_MS;
  const intervalMs = o.intervalMs ?? RECEIPT_POLL_MS;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const deadline = now() + timeoutMs;
  for (;;) {
    try {
      const r = await o.getReceipt(hash);
      if (r) return { kind: "receipt", status: r.status === "success" ? "success" : "reverted" };
    } catch {
      /* not mined yet, or a transient RPC error: keep polling until the deadline */
    }
    if (now() >= deadline) break;
    await sleep(intervalMs);
  }
  const known = await o.isKnown(hash).catch(() => false);
  return { kind: "timeout", known };
}
