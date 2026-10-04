/**
 * Small in-memory TTL cache for server-side chain reads. It stores the in-flight
 * promise, so concurrent callers share one RPC round trip, and it drops an entry as
 * soon as its promise rejects: errors are never served from cache.
 */
export class TtlCache {
  private readonly entries = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly maxEntries = 2000,
  ) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const t = this.now();
    const hit = this.entries.get(key);
    if (hit && t - hit.at < ttlMs) return hit.value as Promise<T>;
    if (this.entries.size >= this.maxEntries) this.prune(t, ttlMs);
    const value = load();
    const entry = { at: t, value };
    this.entries.set(key, entry);
    value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return value;
  }

  /** Drops the oldest half when full (keys are per address / per round, so this stays bounded). */
  private prune(now: number, ttlMs: number) {
    for (const [k, e] of this.entries) if (now - e.at >= ttlMs) this.entries.delete(k);
    if (this.entries.size < this.maxEntries) return;
    const victims = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, Math.ceil(this.maxEntries / 2));
    for (const [k] of victims) this.entries.delete(k);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

/**
 * A sliding block window of event logs that is scanned once in full and then only
 * extended by the blocks minted since the last call. `fetch` must return items in
 * block order. A failed fetch leaves the window untouched (and rethrows).
 */
export class LogWindow<T extends { blockNumber: bigint }> {
  private items: T[] = [];
  private fromBlock = 0n;
  private scannedTo: bigint | null = null;

  constructor(
    private readonly fetch: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
    private readonly span: bigint,
  ) {}

  async refresh(head: bigint): Promise<{ items: readonly T[]; fromBlock: bigint; toBlock: bigint }> {
    const windowFrom = head > this.span ? head - this.span : 0n;
    if (this.scannedTo == null || this.scannedTo < windowFrom) {
      let from = windowFrom;
      let items: T[];
      try {
        items = await this.fetch(from, head);
      } catch {
        // RPCs with a tighter eth_getLogs range: fall back to a fifth of the window.
        const span = this.span / 5n;
        from = head > span ? head - span : 0n;
        items = await this.fetch(from, head);
      }
      this.items = items;
      this.fromBlock = from;
    } else if (head > this.scannedTo) {
      const tail = await this.fetch(this.scannedTo + 1n, head);
      const from = this.fromBlock > windowFrom ? this.fromBlock : windowFrom;
      this.items = [...this.items, ...tail].filter((i) => i.blockNumber >= from);
      this.fromBlock = from;
    } else {
      return { items: this.items, fromBlock: this.fromBlock, toBlock: this.scannedTo };
    }
    this.scannedTo = head;
    return { items: this.items, fromBlock: this.fromBlock, toBlock: head };
  }
}
