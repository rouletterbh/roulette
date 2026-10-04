import { describe, it, expect } from "vitest";
import { rewardRegistry } from "@/config/tokens";
import { buildRewardRows, type VaultAssetRaw } from "@/lib/web3/treasury-view";
import { chainAssetOptions, chainTableOptions, demoAssetOptions, demoTableOptions, tableLabel } from "./options";

const CASHCAT = rewardRegistry.find((t) => t.symbol === "CASHCAT")!.contractAddress!.toLowerCase();
const PONS = rewardRegistry.find((t) => t.symbol === "PONS")!.contractAddress!.toLowerCase();
const raw = (over: Partial<VaultAssetRaw> = {}): VaultAssetRaw => ({ registered: true, enabled: true, decimals: 18, status: 0, inventory: 0n, minimumPayoutUsd: 5n * 10n ** 17n, priceUsd1e18: 10n ** 17n, ...over });
const options = (m: Map<string, VaultAssetRaw>) => chainAssetOptions(buildRewardRows(m), m);

describe("chain asset options", () => {
  it("lists only assets registered on the vault, with their real status", () => {
    const o = options(new Map([[CASHCAT, raw()], [PONS, raw({ status: 2, inventory: 60n * 10n ** 18n })]]));
    expect(o.map((x) => x.symbol)).toEqual(["CASHCAT", "PONS"]);
    expect(o[0]).toMatchObject({ id: "crypto-cashcat", selectable: false, statusLabel: "No vault inventory" });
    expect(o[1]).toMatchObject({ id: "crypto-pons", selectable: true, status: "available", statusLabel: "Available" });
    // Stock Tokens and other registry entries without a vault registration never appear.
    expect(o.some((x) => x.id.startsWith("stock-"))).toBe(false);
  });
  it("is empty when the vault knows no asset, and never selectable when disabled", () => {
    expect(options(new Map())).toEqual([]);
    expect(options(new Map([[CASHCAT, raw({ registered: false })]]))).toEqual([]);
    expect(options(new Map([[CASHCAT, raw({ enabled: false, status: 2, inventory: 10n ** 18n })]]))[0]).toMatchObject({ selectable: false, statusLabel: "Not enabled" });
    expect(options(new Map([[CASHCAT, raw({ status: 1, inventory: 10n ** 18n })]]))[0]).toMatchObject({ selectable: true, status: "low" });
  });
});

describe("chain table options", () => {
  const t = (id: number, over = {}) => ({ id, minStake: 1n, maxStake: 500n, isPrivate: false, active: true, ...over });
  it("lists active public tables; the default one under the quick-play key", () => {
    expect(chainTableOptions([t(1), t(2), t(3, { active: false }), t(4, { isPrivate: true })], 1)).toEqual([{ id: "quick", name: "Table 1" }, { id: "2", name: "Table 2" }]);
    expect(chainTableOptions([], 1)).toEqual([]);
  });
  it("labels a seat's table without inventing names", () => {
    const opts = chainTableOptions([t(1)], 1);
    expect(tableLabel("quick", opts, true)).toBe("Table 1");
    expect(tableLabel("quick", [], true)).toBe("the onchain table");
    expect(tableLabel("2", [], true)).toBe("Table 2");
    expect(tableLabel("practice", opts, true)).toBe("Practice table");
  });
});

describe("demo options (demo mode on) are unchanged", () => {
  it("keeps the simulated tables and assets", () => {
    expect(demoTableOptions().map((x) => x.id)).toEqual(["quick", "neon-01", "classic", "late-shift"]);
    expect(tableLabel("neon-01", demoTableOptions(), false)).toBe("NEON 01");
    expect(tableLabel("high-roller", demoTableOptions(), false)).toBe("HIGH ROLLER");
    expect(tableLabel("quick", demoTableOptions(), false)).toBe("Quick play");
    expect(demoAssetOptions().length).toBe(rewardRegistry.length);
    expect(demoAssetOptions().find((x) => x.symbol === "CASHCAT")).toMatchObject({ selectable: true });
  });
});
