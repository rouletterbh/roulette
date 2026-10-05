import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Hex } from "viem";
import type { TxSpec } from "@/lib/web3/use-tx-flow";
import { FakeChain } from "@/lib/agent-wallet/__fixtures__/fake-chain";

/**
 * The on-chain agent UI against a fake chain: what the approval step says, what the
 * wallet panel shows, and that the key controls behave (export behind a confirm,
 * deletion refused with funds). No network, no wallet.
 */
const OWNER = "0x0000000000000000000000000000000000000B0b" as const;
const FLOAT = 300_000_000_000_000n;
const chains = vi.hoisted(() => new Map<string, unknown>());
const owner = vi.hoisted(() => ({
  fundingGap: vi.fn(async () => ({ chipsMissing: 20, ethMissing: 300_000_000_000_000n })),
  fundAgent: vi.fn(async () => "0xf0" as Hex),
  topUpAgentGas: vi.fn(async () => "0xf1" as Hex),
}));
const flow = vi.hoisted(() => ({ opened: [] as TxSpec[] }));

vi.mock("@/lib/agent-wallet/signer", () => ({
  agentIOFor: (seatId: string) => chains.get(seatId) ?? null,
  agentPublicClient: () => ({ getGasPrice: async () => 20_000_000n }),
}));
vi.mock("@/lib/agent-wallet/owner-actions", () => owner);
vi.mock("@/lib/web3/use-tx-flow", () => ({
  useTxFlow: () => ({ open: (s: TxSpec) => void flow.opened.push(s), close: vi.fn(), isOpen: false, busy: false, step: "review", hash: null, error: null, modalProps: { open: false, step: "review", title: "", summary: [], hash: null, error: null, onClose: vi.fn(), onConfirm: vi.fn() } }),
}));
vi.mock("@/lib/web3/hooks", () => ({
  useChipBalances: () => ({ balances: { 1: 0n, 5: 0n, 10: 4n, 25: 0n, 50: 0n, 100: 0n }, units: 40, isLoading: false, error: null, refetch: vi.fn(), enabled: true }),
}));
vi.mock("./agent-options", () => ({
  AgentOptionsProvider: ({ children }: { children: React.ReactNode }) => children,
  useAgentOptions: () => ({ assets: [], tables: [], ready: true, live: true, tablesUnreadable: false, assetsUnreadable: false, chipUsd: null }),
  vaultNote: () => "",
}));
vi.mock("./use-agent-driver", () => ({ useAgentDriver: () => {} }));

const { useAgentSeats } = await import("@/store/agent-seat");
const { useWallet } = await import("@/store/wallet");
const { createAgentKey, getAgentKeyInfo, readAgentPrivateKey } = await import("@/lib/agent-wallet/keystore");
const { useAgentLive, kickAgentRunners } = await import("@/lib/agent-wallet/manager");
const { AgentWalletPanel, AgentWalletsList, AGENT_WALLET_EXPLAINER } = await import("./chain-agent");
const { AgentSeatPanel, ApprovalTerms } = await import("./agent-seat-panel");

function newSeat() {
  const made = useAgentSeats.getState().create({ name: "Steady red", owner: OWNER, tableId: "1", rules: { bets: [{ betId: "red", stake: 2 }], cadence: "every", maxRounds: 5, stopLoss: 10, stopWin: null, timeLimitMinutes: 30 }, allowance: 20, isPublic: false });
  if (!made.ok) throw new Error(made.error);
  return made.id;
}

function fundedSeat() {
  const id = newSeat();
  const key = createAgentKey(id, OWNER);
  const chain = new FakeChain({ agent: key.address, owner: OWNER });
  chain.fund(20, FLOAT);
  chains.set(id, chain);
  const s = useAgentSeats.getState();
  s.attachWallet(id, key.address);
  s.markFunded(id);
  s.approve(id);
  return { id, key, chain };
}

beforeEach(() => {
  localStorage.clear();
  chains.clear();
  flow.opened.length = 0;
  owner.fundAgent.mockClear();
  useAgentSeats.setState({ seats: {} });
  useAgentLive.setState({ bySeat: {}, keysVersion: 0 });
  useWallet.setState({ status: "connected", address: OWNER });
});
afterEach(cleanup);

describe("approval copy", () => {
  it("says what the agent wallet is, what the owner signs, and that it runs only while the tab is open", () => {
    const { container } = render(<ApprovalTerms allowance={20} gasPrice={20_000_000n} />);
    const text = container.textContent ?? "";
    expect(text).toContain(AGENT_WALLET_EXPLAINER);
    expect(text).toContain("A burner wallet created in this browser");
    expect(text).toContain("Clearing site data deletes the key, so sweep first");
    expect(text).toContain("0.0003 ETH");
    expect(text).toMatch(/about \d+ bet transactions at the current gas price/);
    expect(text).toContain("20 chips");
    expect(text).toContain("can never lose more than what you send it");
    expect(text).toContain("at most one bet transaction per round");
    expect(text).toContain("runs only while this site is open in a tab");
    expect(text).toContain("does not predict results");
    expect(text.toLowerCase()).not.toContain("demo");
    expect(text).not.toMatch(/earn|profit|improve/i);
  });

  it("does not claim a bet count when the gas price is unknown", () => {
    const { container } = render(<ApprovalTerms allowance={20} gasPrice={null} />);
    expect(container.textContent).not.toMatch(/about \d+ bet/);
  });
});

describe("agent seat panel on chain", () => {
  it("a new seat waits for approval; approving creates the key and opens the two-signature funding flow, and only funding makes it live", async () => {
    const id = newSeat();
    render(<AgentSeatPanel owner={OWNER} tableId="1" balance={0} shared />);
    expect(screen.getByText("Needs approval")).toBeTruthy();
    expect(screen.getByText("What approving does")).toBeTruthy();
    expect(getAgentKeyInfo(id)).toBeNull(); // nothing is created before the owner approves

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve and fund" }));
    });
    await waitFor(() => expect(flow.opened).toHaveLength(1));
    const key = getAgentKeyInfo(id)!;
    expect(key.owner).toBe(OWNER);
    expect(useAgentSeats.getState().seats[id].chain?.address).toBe(key.address);
    expect(useAgentSeats.getState().seats[id].status).toBe("pending-approval"); // not live until funded
    const spec = flow.opened[0];
    expect(spec.title).toBe("Fund agent wallet");
    const rows = Object.fromEntries(spec.summary.map(([k, v]) => [k, v]));
    expect(rows["Chips to send"]).toBe("20 chips");
    expect(rows["Gas float"]).toBe("0.0003 ETH");
    expect(rows["Signatures"]).toBe("2 · gas, then chips");

    await act(async () => {
      const hash = await spec.run(() => {});
      await spec.onSuccess?.(hash);
    });
    expect(owner.fundAgent).toHaveBeenCalledWith({ agent: key.address, allowanceUnits: 20, gasFloatWei: FLOAT }, expect.any(Function));
    expect(useAgentSeats.getState().seats[id].status).toBe("active");
    expect(useAgentSeats.getState().seats[id].chain?.fundedAt).not.toBeNull();
  });

  it("refuses to fund from a wallet that does not own the agent", async () => {
    newSeat();
    useWallet.setState({ address: "0x00000000000000000000000000000000000000Cc" });
    render(<AgentSeatPanel owner={OWNER} tableId="1" balance={0} shared />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve and fund" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/different wallet/);
    expect(flow.opened).toHaveLength(0);
  });

  it("shows the live wallet figures, the address with an explorer link, and Stop returns the funds", async () => {
    const { id, key, chain } = fundedSeat();
    render(<AgentSeatPanel owner={OWNER} tableId="1" balance={0} shared />);
    await waitFor(() => expect(chain.escrow).toBe(20n));
    await waitFor(() => expect(screen.getByText("Seated. Waiting for the operator to open a round.")).toBeTruthy());
    const link = screen.getByTitle(key.address) as HTMLAnchorElement;
    expect(link.href).toContain(`/address/${key.address}`);
    expect(screen.getByText("In escrow").nextElementSibling?.textContent).toBe("20");
    expect(screen.getByText("Gas left").nextElementSibling?.textContent).toMatch(/ETH$/);
    expect(screen.getByText(/runs only while this site is open in a tab/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop and return funds" }));
    });
    await waitFor(() => expect(chain.ownerChips).toBe(20));
    await waitFor(() => expect(chain.eth).toBe(0n));
    expect(useAgentSeats.getState().seats[id].stoppedReason).toBe("Stopped by owner.");
    expect(chain.sent.map((s) => s.kind)).toEqual(["approve", "enter", "leave", "chips", "eth"]);
  });

  it("a seat from before on-chain agents has no wallet and can only be discarded", () => {
    const id = newSeat();
    useAgentSeats.getState().approve(id);
    render(<AgentSeatPanel owner={OWNER} tableId="1" balance={0} shared />);
    expect(screen.getByText(/has no wallet and never held funds/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard it" }));
    expect(useAgentSeats.getState().seats[id]).toBeUndefined();
  });

  it("discarding an unapproved seat is refused while its wallet holds anything", async () => {
    const id = newSeat();
    const key = createAgentKey(id, OWNER);
    const chain = new FakeChain({ agent: key.address, owner: OWNER });
    chain.eth = FLOAT; // the owner signed the gas transfer, then stopped
    chains.set(id, chain);
    useAgentSeats.getState().attachWallet(id, key.address);
    render(<AgentSeatPanel owner={OWNER} tableId="1" balance={0} shared />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });
    await waitFor(() => expect(screen.getByText(/still holds ETH/)).toBeTruthy());
    expect(useAgentSeats.getState().seats[id]).toBeDefined();
    expect(getAgentKeyInfo(id)).not.toBeNull();
  });
});

describe("agent wallet panel", () => {
  it("renders nothing without a key", () => {
    const { container } = render(<AgentWalletPanel seatId="none" />);
    expect(container.textContent).toBe("");
  });

  it("the private key is shown only after an explicit confirm, and hidden again on request", async () => {
    const { id } = fundedSeat();
    const secret = readAgentPrivateKey(id)!;
    const { container } = render(<AgentWalletPanel seatId={id} seat={useAgentSeats.getState().seats[id]} />);
    expect(container.innerHTML).not.toContain(secret);
    fireEvent.click(screen.getByRole("button", { name: "Export key" }));
    expect(screen.getByText(/Anyone who sees it can move those chips/)).toBeTruthy();
    expect(container.innerHTML).not.toContain(secret);
    fireEvent.click(screen.getByRole("button", { name: "Reveal private key" }));
    expect((container.querySelector("input[readonly]") as HTMLInputElement).value).toBe(secret);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(container.querySelector("input[readonly]")).toBeNull();
    expect(container.innerHTML).not.toContain(secret);
  });

  it("refuses to delete the key while the address holds funds, from a fresh chain read", async () => {
    const { id } = fundedSeat();
    useAgentSeats.getState().pause(id); // keep the runner from moving anything
    render(<AgentWalletPanel seatId={id} seat={useAgentSeats.getState().seats[id]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete key" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete agent key" });
    await act(async () => {
      fireEvent.click(dialog.querySelector("button")!);
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Sweep them back first/));
    expect(getAgentKeyInfo(id)).not.toBeNull();
  });

  it("deletes the key once the address is empty", async () => {
    const { id, chain } = fundedSeat();
    useAgentSeats.getState().stop(id, "Stopped by owner.");
    kickAgentRunners();
    await waitFor(() => expect(chain.agentUnits === 0 && chain.eth === 0n).toBe(true));
    const onDeleted = vi.fn();
    render(<AgentWalletPanel seatId={id} seat={useAgentSeats.getState().seats[id]} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete key" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("alertdialog", { name: "Delete agent key" }).querySelector("button")!);
    });
    await waitFor(() => expect(getAgentKeyInfo(id)).toBeNull());
    expect(onDeleted).toHaveBeenCalled();
  });

  it("lists every wallet kept in this browser, including one whose agent record is gone", async () => {
    fundedSeat();
    const orphan = createAgentKey("gone", OWNER);
    const chain = new FakeChain({ agent: orphan.address, owner: OWNER });
    chain.fund(5, FLOAT);
    chains.set("gone", chain);
    render(<AgentWalletsList />);
    expect(screen.getByText("Steady red")).toBeTruthy();
    expect(screen.getByText("Wallet without an agent record")).toBeTruthy();
    await waitFor(() => expect(useAgentLive.getState().bySeat.gone?.snapshot?.chipUnits).toBe(5));
    expect(chain.sent).toHaveLength(0); // shown, never moved without the owner asking
  });
});
