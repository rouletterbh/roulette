import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Hex } from "viem";
import type { TxSpec } from "@/lib/web3/use-tx-flow";
import type { ChipBalances } from "@/lib/web3/contracts";

/**
 * The quick start against mocked chain reads: pick a style, pick a budget, Start runs the
 * existing funding path with exactly that allowance. Plus the empty states. No network.
 */
const OWNER = "0x0000000000000000000000000000000000000B0b" as const;
const FLOAT = 300_000_000_000_000n;
const empty = (): ChipBalances => ({ 1: 0n, 5: 0n, 10: 0n, 25: 0n, 50: 0n, 100: 0n });

const state = vi.hoisted(() => ({ balances: null as unknown as ChipBalances, escrow: 0n, search: "" }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
const owner = vi.hoisted(() => ({
  fundingGap: vi.fn(async (input: { allowanceUnits: number }) => ({ chipsMissing: input.allowanceUnits, ethMissing: 300_000_000_000_000n })),
  fundAgent: vi.fn(async () => "0xf0" as Hex),
  topUpAgentGas: vi.fn(async () => "0xf1" as Hex),
}));
const actions = vi.hoisted(() => ({ leaveTable: vi.fn(async () => "0xee" as Hex) }));
const flow = vi.hoisted(() => ({ opened: [] as TxSpec[] }));
const refetch = vi.hoisted(() => ({ chips: vi.fn(async () => ({})), escrow: vi.fn(async () => ({})) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
  usePathname: () => "/agents/new",
}));
vi.mock("@/lib/agent-wallet/signer", () => ({
  agentIOFor: () => null,
  agentPublicClient: () => ({ getGasPrice: async () => 20_000_000n }),
}));
vi.mock("@/lib/agent-wallet/owner-actions", () => owner);
vi.mock("@/lib/web3/actions", () => actions);
vi.mock("@/lib/web3/use-tx-flow", () => ({
  useTxFlow: () => ({ open: (s: TxSpec) => void flow.opened.push(s), close: vi.fn(), isOpen: false, busy: false, step: "review", hash: null, error: null, modalProps: { open: false, step: "review", title: "", summary: [], hash: null, error: null, onClose: vi.fn(), onConfirm: vi.fn() } }),
}));
vi.mock("@/lib/web3/hooks", async () => {
  const { chipUnits } = await import("@/lib/web3/contracts");
  return {
    useChipBalances: () => ({ balances: state.balances, units: chipUnits(state.balances), isLoading: false, error: null, refetch: refetch.chips, enabled: true }),
    useEscrow: () => ({ escrow: state.escrow, units: Number(state.escrow), isLoading: false, isFetched: true, error: null, refetch: refetch.escrow, enabled: true }),
  };
});
vi.mock("./agent-options", () => ({
  AgentOptionsProvider: ({ children }: { children: React.ReactNode }) => children,
  useAgentOptions: () => ({ assets: [], tables: [{ id: "quick", name: "Table 1" }], ready: true, live: true, tablesUnreadable: false, assetsUnreadable: false, chipUsd: null }),
  vaultNote: () => "",
}));
vi.mock("./use-agent-driver", () => ({ useAgentDriver: () => {} }));

const { useAgentSeats } = await import("@/store/agent-seat");
const { useWallet } = await import("@/store/wallet");
const { useStable } = await import("@/store/stable");
const { useAgentLive } = await import("@/lib/agent-wallet/manager");
const { AgentBuilder } = await import("./agent-builder");

beforeEach(() => {
  localStorage.clear();
  state.balances = { ...empty(), 1: 5n, 5: 3n, 10: 2n, 25: 1n }; // 65 chips
  state.escrow = 0n;
  state.search = "";
  flow.opened.length = 0;
  nav.push.mockClear();
  owner.fundAgent.mockClear();
  actions.leaveTable.mockClear();
  useAgentSeats.setState({ seats: {} });
  useAgentLive.setState({ bySeat: {}, keysVersion: 0 });
  useStable.setState({ draft: null });
  useWallet.setState({ status: "connected", address: OWNER });
});
afterEach(cleanup);

describe("agent quick start (chain)", () => {
  it("style → budget → Start funds the agent with exactly that budget and the derived rules", async () => {
    render(<AgentBuilder />);
    expect(screen.getByText("Start an agent in three steps.")).toBeTruthy();
    const start = screen.getByRole("button", { name: "Start agent" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    const styles = screen.getByRole("radiogroup", { name: "Pick a style" });
    expect(styles.querySelectorAll('[role="radio"]')).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: /^Dozens/ }));
    expect(screen.getByRole("radio", { name: /^Dozens/ }).getAttribute("aria-checked")).toBe("true");

    const budgets = screen.getByRole("radiogroup", { name: "How much?" });
    expect([...budgets.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual(["5 chips", "10 chips", "25 chips", "50 chips", "All 65 chips"]);
    fireEvent.click(screen.getByRole("radio", { name: "25 chips" }));
    expect(screen.getAllByText("Plays up to 100 rounds or 1 hour. Stops when the 25 chips are gone or you press Stop. Whatever is left comes back to your wallet.").length).toBeGreaterThan(0);
    expect(screen.getByText(/You approve two transfers: 0.0003 ETH for gas and 25 chips/)).toBeTruthy();
    expect(screen.getByText("How it works")).toBeTruthy();

    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(() => expect(flow.opened).toHaveLength(1));
    const seats = Object.values(useAgentSeats.getState().seats);
    expect(seats).toHaveLength(1);
    const seat = seats[0];
    expect(seat.allowance).toBe(25);
    expect(seat.rules).toEqual({ bets: [{ betId: "dozen:1", stake: 1 }], cadence: "every", condition: null, maxBet: 1, maxRounds: 100, stopLoss: 25, stopWin: null, timeLimitMinutes: 60 });
    expect(seat.isPublic).toBe(false);
    expect(seat.collection).toEqual({ primaryAssetId: null, fallbackAssetId: null });
    expect(seat.tableId).toBe("quick");
    expect(seat.name).toMatch(/^[A-Z]+-\d+$/);
    expect(seat.code).toBe(seat.name);
    expect(seat.status).toBe("pending-approval");

    const spec = flow.opened[0];
    expect(spec.title).toBe("Fund agent wallet");
    expect(Object.fromEntries(spec.summary)["Chips to send"]).toBe("25 chips");
    await act(async () => {
      const hash = await spec.run(() => {});
      await spec.onSuccess?.(hash);
    });
    expect(owner.fundAgent).toHaveBeenCalledWith({ agent: seat.chain!.address, allowanceUnits: 25, gasFloatWei: FLOAT }, expect.any(Function));
    expect(useAgentSeats.getState().seats[seat.id].status).toBe("active");
    expect(nav.push).toHaveBeenCalledWith("/play/quick");
  });

  it("arrow keys move the style selection", () => {
    render(<AgentBuilder />);
    const first = screen.getByRole("radio", { name: /^Red or black/ });
    expect(first.tabIndex).toBe(0);
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /^Wait for a streak/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/streaks do not change the odds/)).toBeTruthy();
  });

  it("a wallet with a single 50 chip explains denominations and offers Use all 50", () => {
    state.balances = { ...empty(), 50: 1n };
    render(<AgentBuilder />);
    expect(screen.getByText(/cannot be split/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Red or black/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use all 50 chips" }));
    expect((screen.getByRole("button", { name: "Start agent" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("chips only at the table: one button moves them back through the transaction modal", async () => {
    state.balances = empty();
    state.escrow = 45n;
    render(<AgentBuilder />);
    expect(screen.getByText("Your 45 chips are at the table. Move them to your wallet first.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move 45 chips to my wallet" }));
    expect(flow.opened).toHaveLength(1);
    await act(async () => {
      const hash = await flow.opened[0].run(() => {});
      await flow.opened[0].onSuccess?.(hash);
    });
    expect(actions.leaveTable).toHaveBeenCalledWith(45n, expect.any(Function));
    expect(refetch.chips).toHaveBeenCalled();
    expect(refetch.escrow).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Start agent" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no chips at all links to the cashier", () => {
    state.balances = empty();
    render(<AgentBuilder />);
    expect(screen.getByText("You need chips first.")).toBeTruthy();
    expect((screen.getByRole("link", { name: "Get chips" }) as HTMLAnchorElement).getAttribute("href")).toBe("/cashier");
  });

  it("practice: budget from the practice balance, approved at once, no funding", async () => {
    state.search = "table=practice";
    render(<AgentBuilder />);
    fireEvent.click(screen.getByRole("radio", { name: /^One number/ }));
    fireEvent.click(screen.getByRole("radio", { name: "25 chips" }));
    fireEvent.click(screen.getByRole("button", { name: "Start agent" }));
    const seat = Object.values(useAgentSeats.getState().seats)[0];
    expect(seat.owner).toBe("practice");
    expect(seat.status).toBe("active");
    expect(seat.rules.bets).toEqual([{ betId: "straight:17", stake: 1 }]);
    expect(flow.opened).toHaveLength(0);
    expect(nav.push).toHaveBeenCalledWith("/play/practice");
  });

  it("Customise rules opens the advanced builder with plain section names", () => {
    state.search = "mode=advanced";
    render(<AgentBuilder />);
    for (const t of ["When to bet", "How often", "Limits", "Winnings"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.queryByText("Thesis")).toBeNull();
    expect(screen.queryByText("Leash")).toBeNull();
    expect(screen.getByText(/Chip allowance \(at most half of your 65 chips: 32\)/)).toBeTruthy();
  });

  it("never says demo", () => {
    const { container } = render(<AgentBuilder />);
    expect(container.textContent?.toLowerCase()).not.toContain("demo");
  });
});
