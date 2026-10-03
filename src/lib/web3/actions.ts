import { getAccount, getTransaction, readContract, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";

/** How long the modal waits for a receipt before reporting a dropped or stuck transaction. */
const RECEIPT_TIMEOUT_MS = 90_000;
import type { Address, Hex } from "viem";
import { activeChain } from "@/config/chains";
import type { PlacedBet } from "@/lib/roulette/bets";
import type { TxStep } from "@/components/cashier/transaction-modal";
import { wagmiConfig } from "./wagmi";
import { TxError, toTxError } from "./errors";
import { casinoTreasuryAbi, chip1155Abi, contractAddresses, rewardVaultAbi, rouletteGameAbi, selectAllChips, selectChips, toPlaceBetsArgs, type ChipBalances } from "./contracts";

/**
 * Write actions against the live contracts. Every action:
 *   1. checks the wallet is on Robinhood Chain,
 *   2. `simulateContract` first (reverts surface as decoded TxErrors before any signature),
 *   3. `writeContract` → "confirm-wallet" / "submitted", then `waitForTransactionReceipt` → "confirming",
 *   4. resolves with the tx hash after "complete" (or throws a TxError after "failed").
 * Progress is reported through a callback that matches the TransactionModal steps.
 */
export type TxReporter = (step: TxStep, ctx?: { hash?: Hex }) => void;

const chainId = activeChain.id;

function need<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new TxError("unknown", `${what} address is not configured (NEXT_PUBLIC_*_ADDRESS).`);
  return v;
}

export function connectedAccount(): { address: Address; chainId: number } {
  const a = getAccount(wagmiConfig);
  if (!a.address) throw new TxError("unknown", "Connect a wallet first.");
  if (a.chainId !== chainId) throw new TxError("wrong-network", `Switch your wallet to ${activeChain.name} to continue.`);
  return { address: a.address, chainId: a.chainId };
}

/** Signs/sends via the thunk (a `writeContract` of a simulated request) and tracks it to a receipt. */
async function send(report: TxReporter, write: () => Promise<Hex>): Promise<Hex> {
  report("confirm-wallet");
  const hash = await write();
  report("submitted", { hash });
  report("confirming", { hash });
  let receipt;
  try {
    receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId, confirmations: 1, timeout: RECEIPT_TIMEOUT_MS });
  } catch (e) {
    // A wallet can return a hash for a transaction that never reaches the network (seen on mainnet: the
    // node did not know the hash and the nonce never advanced). Say so instead of spinning forever.
    const known = await getTransaction(wagmiConfig, { hash, chainId }).then(() => true, () => false);
    if (!known) throw new TxError("dropped", "The network never saw this transaction. Your wallet may not have broadcast it; nothing was charged. Try again.");
    if (e instanceof Error && /timed out|timeout/i.test(e.message)) throw new TxError("timeout", "Still waiting for the network to include this transaction. Check the explorer link before retrying.");
    throw e;
  }
  if (receipt.status !== "success") throw new TxError("reverted", "Transaction reverted on chain.");
  return hash;
}

/** Wraps an action so the modal always ends in complete | failed and errors are TxErrors. */
async function guarded(report: TxReporter, fn: () => Promise<Hex>): Promise<Hex> {
  try {
    const hash = await fn();
    report("complete", { hash });
    return hash;
  } catch (e) {
    const err = toTxError(e);
    report("failed");
    throw err;
  }
}

/* --------------------------------------------------------------- cashier */

/** CasinoTreasury.deposit{value}: mints chips for the payout-liquidity share of `valueWei`. */
export function deposit(valueWei: bigint, report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const treasury = need(contractAddresses.treasury, "Treasury");
    const { request } = await simulateContract(wagmiConfig, { abi: casinoTreasuryAbi, address: treasury, functionName: "deposit", value: valueWei, account: address, chainId });
    return send(report, () => writeContract(wagmiConfig, request));
  });
}

export async function isChipsApproved(owner: Address): Promise<boolean> {
  const chip = need(contractAddresses.chip, "Chip1155");
  const treasury = need(contractAddresses.treasury, "Treasury");
  return readContract(wagmiConfig, { abi: chip1155Abi, address: chip, functionName: "isApprovedForAll", args: [owner, treasury], chainId });
}

/** Chip1155.setApprovalForAll(treasury, true): one-time operator approval for escrow and redemption. */
export function approveChips(report: TxReporter) {
  return guarded(report, () => approveChipsInner(report));
}

async function approveChipsInner(report: TxReporter): Promise<Hex> {
  const { address } = connectedAccount();
  const chip = need(contractAddresses.chip, "Chip1155");
  const treasury = need(contractAddresses.treasury, "Treasury");
  const { request } = await simulateContract(wagmiConfig, { abi: chip1155Abi, address: chip, functionName: "setApprovalForAll", args: [treasury, true], account: address, chainId });
  return send(report, () => writeContract(wagmiConfig, request));
}

/** Runs the approval step first when the treasury is not yet an approved operator. */
async function ensureApproved(report: TxReporter, owner: Address) {
  if (await isChipsApproved(owner)) return;
  report("approve");
  await approveChipsInner(report);
}

/** CasinoTreasury.redeem(ids, amounts): burns chips and credits ETH to `withdrawable`. */
export function redeem(ids: readonly bigint[], amounts: readonly bigint[], report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const treasury = need(contractAddresses.treasury, "Treasury");
    await ensureApproved(report, address);
    const { request } = await simulateContract(wagmiConfig, { abi: casinoTreasuryAbi, address: treasury, functionName: "redeem", args: [[...ids], [...amounts]], account: address, chainId });
    return send(report, () => writeContract(wagmiConfig, request));
  });
}

/** CasinoTreasury.withdraw(): pulls every wei credited to the caller. */
export function withdraw(report: TxReporter) {
  return guarded(report, () => withdrawInner(report));
}

async function withdrawInner(report: TxReporter): Promise<Hex> {
  const { address } = connectedAccount();
  const treasury = need(contractAddresses.treasury, "Treasury");
  const { request } = await simulateContract(wagmiConfig, { abi: casinoTreasuryAbi, address: treasury, functionName: "withdraw", account: address, chainId });
  return send(report, () => writeContract(wagmiConfig, request));
}

/** Redeem `units` worth of wallet chips (greedy by denomination) and withdraw the ETH in one flow. Returns the withdraw hash. */
export function redeemAndWithdraw(balances: ChipBalances, units: number, report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const treasury = need(contractAddresses.treasury, "Treasury");
    const sel = selectChips(balances, units);
    if (sel.ids.length === 0) throw new TxError("insufficient-chips", "No chips in your wallet to redeem.");
    if (!sel.exact) throw new TxError("insufficient-chips", `Your chip denominations can cover ${sel.units} units, not ${units}. Adjust the amount.`);
    await ensureApproved(report, address);
    const { request } = await simulateContract(wagmiConfig, { abi: casinoTreasuryAbi, address: treasury, functionName: "redeem", args: [sel.ids, sel.amounts], account: address, chainId });
    await send(report, () => writeContract(wagmiConfig, request));
    return withdrawInner(report);
  });
}

/* ------------------------------------------------------------------ table */

/** RouletteGame.enterTable(ids, amounts): escrows chips (approves the treasury first if needed). */
export function enterTable(ids: readonly bigint[], amounts: readonly bigint[], report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const game = need(contractAddresses.game, "RouletteGame");
    if (ids.length === 0) throw new TxError("insufficient-chips", "No chips selected.");
    await ensureApproved(report, address);
    const { request } = await simulateContract(wagmiConfig, { abi: rouletteGameAbi, address: game, functionName: "enterTable", args: [[...ids], [...amounts]], account: address, chainId });
    return send(report, () => writeContract(wagmiConfig, request));
  });
}

/** Escrow `units` chips picked greedily from `balances` (all chips when `units` is omitted). */
export function enterTableUnits(balances: ChipBalances, units: number | undefined, report: TxReporter) {
  const sel = units == null ? selectAllChips(balances) : selectChips(balances, units);
  if (units != null && !sel.exact) {
    return guarded(report, async () => {
      throw new TxError("insufficient-chips", sel.units > 0 ? `Your chip denominations can cover ${sel.units} units, not ${units}. Enter ${sel.units} or get smaller chips.` : "Not enough chips in your wallet.");
    });
  }
  return enterTable(sel.ids, sel.amounts, report);
}

/** RouletteGame.leaveTable(units): mints escrowed units back to the wallet. Never pausable. */
export function leaveTable(units: bigint, report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const game = need(contractAddresses.game, "RouletteGame");
    if (units <= 0n) throw new TxError("unknown", "Nothing to withdraw from the table.");
    const { request } = await simulateContract(wagmiConfig, { abi: rouletteGameAbi, address: game, functionName: "leaveTable", args: [units], account: address, chainId });
    return send(report, () => writeContract(wagmiConfig, request));
  });
}

/** RouletteGame.placeBets(roundId, bets): stakes come out of escrow; the contract re-checks exposure. */
export function placeBets(roundId: bigint, bets: readonly PlacedBet[], report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const game = need(contractAddresses.game, "RouletteGame");
    if (bets.length === 0) throw new TxError("unknown", "Place at least one bet.");
    const args = toPlaceBetsArgs(roundId, bets);
    const { request } = await simulateContract(wagmiConfig, { abi: rouletteGameAbi, address: game, functionName: "placeBets", args: [args[0], [...args[1]]], account: address, chainId });
    return send(report, () => writeContract(wagmiConfig, request));
  });
}

/* --------------------------------------------------------------- rewards */

/** RewardVault.quote(asset, usd): token base units + oracle price. Throws (decoded) when stale. */
export async function quoteClaim(asset: Address, usd1e18: bigint): Promise<{ amountOut: bigint; price: bigint }> {
  const vault = need(contractAddresses.rewardVault, "RewardVault");
  try {
    const [amountOut, price] = await readContract(wagmiConfig, { abi: rewardVaultAbi, address: vault, functionName: "quote", args: [asset, usd1e18], chainId });
    return { amountOut, price };
  } catch (e) {
    throw toTxError(e);
  }
}

/** RewardVault.claimAs(asset, usdAmount, minOut, deadline). */
export function claimAs(asset: Address, usd1e18: bigint, minOut: bigint, deadline: bigint, report: TxReporter) {
  return guarded(report, async () => {
    const { address } = connectedAccount();
    const vault = need(contractAddresses.rewardVault, "RewardVault");
    const { request } = await simulateContract(wagmiConfig, { abi: rewardVaultAbi, address: vault, functionName: "claimAs", args: [asset, usd1e18, minOut, deadline], account: address, chainId });
    return send(report, () => writeContract(wagmiConfig, request));
  });
}

/** minOut for a quote with `slippageBps` tolerance. */
export function withSlippage(amountOut: bigint, slippageBps = 50): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Unix-seconds deadline `minutes` from now. */
export function deadlineIn(minutes = 10): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}
