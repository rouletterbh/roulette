import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Address, Hex } from "viem";
import type { CollectAsset, CollectState } from "@/lib/web3/hooks";
import type { TxSpec } from "@/lib/web3/use-tx-flow";

/**
 * The collect panel against mocked chain reads: what it offers must follow the vault's
 * inventory, and the two transactions must be the ones the copy describes.
 */
const E18 = 10n ** 18n;
const asset = (symbol: string, over: Partial<CollectAsset> = {}): CollectAsset => ({
  address: `0x${symbol.length.toString(16).padStart(40, "0")}` as Address,
  id: `crypto-${symbol.toLowerCase()}`,
  symbol,
  name: symbol,
  logoURI: null,
  registered: true,
  enabled: true,
  decimals: 18,
  status: "unavailable",
  inventory: 0n,
  minimumPayoutUsd1e18: E18 / 2n,
  maxStalenessSeconds: 900,
  priceUsd1e18: 163_880_000_000_000_000n,
  postedPriceUsd1e18: 163_880_000_000_000_000n,
  priceUpdatedAt: 1_000,
  ...over,
});

const state = vi.hoisted(() => ({ collect: null as unknown as CollectState, approved: true, renders: 0 }));
const actions = vi.hoisted(() => ({
  convertToRewards: vi.fn(async () => "0xc0" as Hex),
  claimAs: vi.fn(async () => "0xc1" as Hex),
  quoteClaim: vi.fn(async () => ({ amountOut: 10n ** 19n, price: 163_880_000_000_000_000n })),
  readClaimReceipt: vi.fn(async () => ({ asset: "0x0" as Address, amountOut: 10n ** 19n, usd1e18: 1_638_800_000_000_000_000n, price: 163_880_000_000_000_000n })),
}));

vi.mock("@/lib/web3/hooks", () => ({
  useCollectState: () => state.collect,
  useChipApproval: () => ({ approved: state.approved, isLoading: false, refetch: vi.fn() }),
  useNowSeconds: () => 1_369,
}));
vi.mock("@/lib/web3/actions", () => ({
  ...actions,
  withSlippage: (v: bigint, bps = 50) => (v * BigInt(10_000 - bps)) / 10_000n,
  deadlineIn: () => 1_600n,
}));
vi.mock("@/lib/analytics/events", () => ({ track: vi.fn(), bucketAmount: (n: number) => String(n) }));

import { CollectPanel, type CollectPanelProps } from "./collect-panel";

const disabled = (el: Element | undefined) => (el as HTMLButtonElement).disabled;
const text = (el: Element | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");
const collect = (assets: CollectAsset[], over: Partial<CollectState> = {}): CollectState => ({ enabled: true, assets, pauseFlags: 0, vaultLinked: true, isFetched: true, readFailed: false, refetch: vi.fn(), ...over });
const chips50 = { balances: { 1: 0n, 5: 0n, 10: 0n, 25: 0n, 50: 1n, 100: 0n }, units: 50, refetch: vi.fn() };

function setup(over: Partial<CollectPanelProps> = {}) {
  const open = vi.fn<(spec: TxSpec) => void>();
  const record = vi.fn();
  const props: CollectPanelProps = {
    address: "0x1c01912b96BA6783ae8c3c1D8e135Ee185079aa5",
    chips: chips50,
    escrowUnits: 0,
    win: { usd1e18: 0n, isFetched: true, refetch: vi.fn() },
    chipUsdValue: E18 / 10n,
    blocked: false,
    treasuryPauseFlags: 0,
    open,
    record,
    refetchTreasury: vi.fn(),
    ...over,
  };
  const Counted = (p: CollectPanelProps) => {
    state.renders++;
    return <CollectPanel {...p} />;
  };
  const view = render(<Counted {...props} />);
  return { open, record, props, view };
}

beforeEach(() => {
  state.renders = 0;
  state.approved = true;
  state.collect = collect([asset("CASHCAT"), asset("PONS"), asset("AI")]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CollectPanel", () => {
  it("mainnet today: offers the conversion, and no asset while the vault holds nothing", () => {
    setup();
    expect(disabled(screen.getByRole("button", { name: "Convert 50 chips" }))).toBe(false);
    expect(screen.getByText(/\$5\.00 · \$0\.10 per chip/)).toBeTruthy();
    expect(screen.getByText(/One-way\./)).toBeTruthy();
    expect(screen.getByText(/cannot be turned back into chips or withdrawn as ETH/)).toBeTruthy();
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(3);
    for (const o of options) {
      expect(disabled(o)).toBe(true);
      expect(text(o)).toContain("Vault inventory is being restocked: conversions are fulfilled in batches.");
      expect(text(o)).toMatch(/Vault holds 0 (CASHCAT|PONS|AI) · price \$0\.16388 · updated 6m ago/);
    }
    expect(disabled(screen.getByRole("button", { name: "Claim" }))).toBe(true);
    // A stable tree: one render, no effect-driven re-render loop.
    expect(state.renders).toBe(1);
  });

  it("converts through the transaction flow with the one-way summary, asking for approval only when it is missing", async () => {
    state.approved = false;
    const { open, record, props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Convert 50 chips" }));
    expect(open).toHaveBeenCalledTimes(1);
    const spec = open.mock.calls[0]![0];
    expect(spec.title).toBe("Convert chips");
    expect(spec.needsApproval).toBe(true);
    expect(spec.summary).toEqual([["Burn", "50 chips"], ["Win balance credit", "$5.00"], ["Then", "claim as a reward asset"], ["One-way", "cannot be withdrawn as ETH"]]);
    const report = vi.fn();
    await act(async () => {
      const hash = await spec.run(report);
      await spec.onSuccess?.(hash);
    });
    expect(actions.convertToRewards).toHaveBeenCalledWith(chips50.balances, 50, report);
    expect(record).toHaveBeenCalledWith("Convert chips", "0xc0");
    expect(props.win.refetch).toHaveBeenCalled();
    expect(text(screen.getByRole("status"))).toContain("Converted 50 chips to $5.00 of win balance.");
    expect(screen.getByRole("link", { name: /View transaction/ }).getAttribute("href")).toEqual(expect.stringContaining("0xc0"));
  });

  it("will not convert an amount the wallet's denominations cannot make, chips at a table, or while claims are paused", () => {
    const { view, props } = setup();
    fireEvent.change(screen.getByLabelText("Chips to convert"), { target: { value: "20" } });
    expect(disabled(screen.getByRole("button", { name: "Convert 20 chips" }))).toBe(true);
    expect(screen.getByText(/cannot make exactly 20\. The nearest amount at or below it is 0\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(disabled(screen.getByRole("button", { name: "Convert 50 chips" }))).toBe(false);

    view.rerender(<CollectPanel {...props} chips={{ balances: { 1: 0n, 5: 0n, 10: 0n, 25: 0n, 50: 0n, 100: 0n }, units: 0, refetch: vi.fn() }} escrowUnits={45} />);
    expect(screen.getByText(/45 chips are at a table\. Leave the table to bring them back to your wallet first/)).toBeTruthy();
    expect(disabled(screen.getByRole("button", { name: "Convert chips" }))).toBe(true);

    state.collect = collect([asset("CASHCAT", { inventory: 250n * E18, status: "available" })], { pauseFlags: 4 });
    view.rerender(<CollectPanel {...props} win={{ ...props.win, usd1e18: 5n * E18 }} />);
    expect(text(screen.getByRole("alert"))).toContain("Conversions and claims are paused by the operator.");
    expect(disabled(screen.getByRole("button", { name: "Convert 50 chips" }))).toBe(true);
    expect(disabled(screen.getByRole("radio"))).toBe(true);
  });

  it("claims at most min(win balance, inventory × price) and shows what was received", async () => {
    // $5 win balance; the vault holds 10 CASHCAT = $1.6388, and no PONS.
    state.collect = collect([asset("CASHCAT", { inventory: 10n * E18, status: "low" }), asset("PONS")]);
    const { open, record } = setup({ win: { usd1e18: 5n * E18, isFetched: true, refetch: vi.fn() } });
    const [cashcat, pons] = screen.getAllByRole("radio");
    expect(disabled(cashcat)).toBe(false);
    expect(text(cashcat)).toContain("Up to $1.63 now (limited by vault inventory; the rest waits for a restock)");
    expect(disabled(pons)).toBe(true);
    fireEvent.click(cashcat!);
    expect(disabled(screen.getByRole("button", { name: "Claim $1.63 as CASHCAT" }))).toBe(false);

    // Typing more than the vault can pay is refused, not silently promised.
    fireEvent.change(screen.getByLabelText("Amount to claim (USD)"), { target: { value: "3" } });
    expect(screen.getByText("The most claimable right now is $1.63.")).toBeTruthy();
    expect(disabled(screen.getByRole("button", { name: "Claim" }))).toBe(true);
    fireEvent.change(screen.getByLabelText("Amount to claim (USD)"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Claim $1.50 as CASHCAT" }));

    const spec = open.mock.calls[0]![0];
    expect(spec.title).toBe("Claim");
    const report = vi.fn();
    await act(async () => {
      const hash = await spec.run(report);
      await spec.onSuccess?.(hash);
    });
    expect(actions.quoteClaim).toHaveBeenCalledWith(state.collect.assets[0]!.address, 15n * 10n ** 17n);
    // minOut = quote less 0.5%; deadline from the shared helper.
    expect(actions.claimAs).toHaveBeenCalledWith(state.collect.assets[0]!.address, 15n * 10n ** 17n, (10n ** 19n * 9950n) / 10_000n, 1_600n, report);
    expect(record).toHaveBeenCalledWith("Claim CASHCAT", "0xc1");
    expect(text(screen.getByRole("status"))).toContain("Received 10 CASHCAT for $1.50 of win balance.");
    expect(screen.getByRole("link", { name: /View transaction/ }).getAttribute("href")).toEqual(expect.stringContaining("0xc1"));
  });

  it("says so when the vault cannot be read, instead of showing availability", () => {
    state.collect = collect([], { readFailed: true });
    setup();
    expect(text(screen.getByRole("alert"))).toContain("The reward vault could not be read just now.");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    cleanup();
    state.collect = collect([], { isFetched: false });
    setup();
    expect(screen.getByLabelText("Reading the reward vault").getAttribute("aria-busy")).toEqual("true");
  });
});
