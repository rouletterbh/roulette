import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { DepositSplitPanel } from "./deposit-split-panel";
import { depositBreakdown, splitAckKey } from "./deposit-split";
import { depositValueFor } from "./chain-cashier";

const SPLIT = { payoutLiquidityBps: 7000, rewardInventoryBps: 2000, protocolReserveBps: 800, platformFeeBps: 200 };
const CHIP = 30_000_000_000_000n;
const b = depositBreakdown(depositValueFor(100, CHIP, 7000), SPLIT, CHIP);

describe("DepositSplitPanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());
  it("states the cash-out value and what is not returned, in ETH, without opening anything", () => {
    render(<DepositSplitPanel breakdown={b} split={SPLIT} chips={100} onAckChange={() => {}} />);
    expect(screen.getByRole("heading", { name: /You get 70% back if you cash out/ })).toBeTruthy();
    expect(screen.getByText(/^These 100 chips cash out for/).textContent).toMatch(/0\.003 ETH/);
    expect(screen.getAllByText(/not returned/).length).toBeGreaterThan(0);
    expect(screen.getByText("Reward inventory")).toBeTruthy();
    expect(screen.getByText("Protocol reserve")).toBeTruthy();
    expect(screen.getByText("Platform fee")).toBeTruthy();
  });
  it("requires the acknowledgement, and remembers it per split", () => {
    const onAck = vi.fn();
    const { unmount } = render(<DepositSplitPanel breakdown={b} split={SPLIT} chips={100} onAckChange={onAck} />);
    expect(onAck).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onAck).toHaveBeenLastCalledWith(true);
    expect(window.localStorage.getItem(splitAckKey(SPLIT))).toBe("1");
    unmount();
    const again = vi.fn();
    render(<DepositSplitPanel breakdown={b} split={SPLIT} chips={100} onAckChange={again} />);
    expect(again).toHaveBeenLastCalledWith(true);
  });
  it("asks again when the split changes", () => {
    window.localStorage.setItem(splitAckKey(SPLIT), "1");
    const onAck = vi.fn();
    const changed = { ...SPLIT, payoutLiquidityBps: 6500, rewardInventoryBps: 2500 };
    render(<DepositSplitPanel breakdown={depositBreakdown(10n ** 16n, changed, CHIP)} split={changed} chips={100} onAckChange={onAck} />);
    expect(onAck).toHaveBeenLastCalledWith(false);
  });
});
