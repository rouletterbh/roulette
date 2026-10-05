import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, InsufficientFundsError, ChainMismatchError, SwitchChainError, decodeErrorResult, type Hex } from "viem";
import { activeChain } from "@/config/chains";
import { allErrorsAbi } from "./contracts";

/**
 * Maps wallet / RPC / contract failures to user-facing copy. Custom errors are
 * decoded against every deployed ABI so reverts that bubble up from RiskEngine or
 * CasinoTreasury through RouletteGame still read as plain language.
 */
export type TxErrorCode =
  | "rejected"
  | "insufficient-funds"
  | "wrong-network"
  | "paused"
  | "table-limit"
  | "insufficient-escrow"
  | "stake-out-of-range"
  | "round-not-open"
  | "not-approved"
  | "insufficient-chips"
  | "deposit-too-small"
  | "nothing-to-withdraw"
  | "oracle-stale"
  | "slippage"
  | "inventory"
  | "deadline"
  | "below-minimum"
  | "insufficient-win-balance"
  | "asset-unavailable"
  | "rewards-unavailable"
  | "reverted"
  | "dropped"
  | "timeout"
  | "unknown";

export class TxError extends Error {
  readonly code: TxErrorCode;
  readonly errorName?: string;
  readonly args?: readonly unknown[];
  constructor(code: TxErrorCode, message: string, extra: { errorName?: string; args?: readonly unknown[]; cause?: unknown } = {}) {
    super(message, extra.cause !== undefined ? { cause: extra.cause } : undefined);
    this.name = "TxError";
    this.code = code;
    this.errorName = extra.errorName;
    this.args = extra.args;
  }
}

const STATUS_LABEL = ["not opened", "open", "closed", "settled", "voided"];
const fmt = (v: unknown) => (typeof v === "bigint" ? v.toString() : String(v));

/** EnforcedPause(flag): flag is the single pause bit that blocked the call (1 deposits, 2 gameplay, 4 claims, 8 withdrawals). */
function pausedMessage(flag: unknown): string {
  switch (Number(flag ?? 0)) {
    case 1:
      return "Deposits are paused by the operator right now.";
    case 4:
      return "Conversions and claims are paused by the operator right now. Your chips and win balance are unchanged; redeeming chips for ETH is a separate switch.";
    case 8:
      return "Withdrawals are paused by the operator right now.";
    default:
      return "This action is paused by the operator right now. Escrow can still be withdrawn with Leave table.";
  }
}

/** Pure mapping of a decoded custom error (name + args) to copy. Exported for tests. */
export function describeContractError(errorName: string, args: readonly unknown[] = []): { code: TxErrorCode; message: string } {
  switch (errorName) {
    case "EnforcedPause":
      return { code: "paused", message: pausedMessage(args[0]) };
    case "ExposureCapExceeded":
      return { code: "table-limit", message: `Table limit reached: this round would owe up to ${fmt(args[0])} units against a cap of ${fmt(args[1])}. Lower your stake.` };
    case "InsufficientEscrow":
      return { code: "insufficient-escrow", message: `Not enough chips at the table (need ${fmt(args[0])}, have ${fmt(args[1])}). Enter more chips first.` };
    case "StakeOutOfRange":
      return { code: "stake-out-of-range", message: `Stake ${fmt(args[1])} is outside this table's limits (${fmt(args[2])}–${fmt(args[3])} per bet).` };
    case "InvalidRoundStatus": {
      const actual = Number(args[1] ?? -1);
      return { code: "round-not-open", message: `Round ${fmt(args[0])} is ${STATUS_LABEL[actual] ?? "not accepting bets"}. Wait for the next round.` };
    }
    case "TooManyBets":
      return { code: "table-limit", message: `This round already holds the maximum number of bets (${fmt(args[1])}).` };
    case "NoBets":
      return { code: "reverted", message: "No bets to place." };
    case "InvalidBet":
      return { code: "reverted", message: `Bet #${fmt(args[0])} has invalid geometry for European roulette.` };
    case "TableNotActive":
      return { code: "round-not-open", message: "This table is not active on chain." };
    case "ERC1155MissingApprovalForAll":
    case "NotOwnerNorApproved":
      return { code: "not-approved", message: "The treasury is not approved to move your chips. Approve chips and try again." };
    case "ERC1155InsufficientBalance":
      return { code: "insufficient-chips", message: "Your wallet does not hold enough chips of that denomination." };
    case "InvalidChipId":
      return { code: "insufficient-chips", message: "That chip id is not a valid denomination." };
    case "DepositTooSmall":
      return { code: "deposit-too-small", message: `Deposit too small to mint a whole chip (chip price ${fmt(args[1])} wei).` };
    case "NothingToWithdraw":
      return { code: "nothing-to-withdraw", message: "Nothing to withdraw yet. Redeem chips first." };
    case "InsufficientBankroll":
      return { code: "reverted", message: "The treasury cannot cover that redemption right now." };
    case "StaleOracle":
      return { code: "oracle-stale", message: "The price feed for this asset is stale. Try again once the oracle updates." };
    case "SlippageExceeded":
      return { code: "slippage", message: `Price moved: you would receive ${fmt(args[0])} base units, below your minimum of ${fmt(args[1])}.` };
    case "InsufficientInventory":
      // (asset, required, available) in token base units.
      return {
        code: "inventory",
        message:
          args.length >= 3 && fmt(args[2]) === "0"
            ? "The reward vault holds none of that asset right now. Vault inventory is being restocked: conversions are fulfilled in batches. Your win balance is unchanged."
            : "The reward vault does not hold enough of that asset for this amount. Claim up to the maximum shown, or pick another asset. Your win balance is unchanged.",
      };
    case "RewardVaultNotSet":
      return { code: "rewards-unavailable", message: "The treasury has no reward vault configured, so chips cannot be converted to a win balance yet. Your chips are unchanged." };
    case "SolvencyViolation":
      return { code: "rewards-unavailable", message: "The treasury rejected this because it would break its solvency check. Nothing was changed; try a smaller amount." };
    case "LengthMismatch":
    case "ERC1155InvalidArrayLength":
      return { code: "reverted", message: "Chip ids and amounts do not line up. Refresh and try again." };
    case "DeadlineExpired":
      return { code: "deadline", message: "The claim quote expired. Re-open the claim to get a fresh quote." };
    case "BelowMinimumPayout":
      return { code: "below-minimum", message: `Claim is below the minimum for this asset (${fmt(args[1])} USD, 18 decimals).` };
    case "InsufficientWinBalance":
      return { code: "insufficient-win-balance", message: "Claim exceeds your win balance." };
    case "AssetNotRegistered":
    case "AssetNotEnabled":
      return { code: "asset-unavailable", message: "That asset is not enabled for claims." };
    case "InvalidPrice":
      return { code: "oracle-stale", message: "The oracle has no valid price for this asset." };
    case "ZeroAmount":
    case "ZeroUnits":
      return { code: "reverted", message: "Amount must be greater than zero." };
    case "Unauthorized":
      return { code: "reverted", message: "Your wallet is not allowed to call this function." };
    case "ReentrancyGuardReentrantCall":
      return { code: "reverted", message: "Re-entrant call rejected by the contract." };
    default:
      return { code: "reverted", message: `Transaction reverted (${errorName}${args.length ? `: ${args.map(fmt).join(", ")}` : ""}).` };
  }
}

/** Decodes raw revert data against every ABI we ship. Null when it is not one of ours. */
export function decodeRevertData(data: Hex | undefined): { errorName: string; args: readonly unknown[] } | null {
  if (!data || data === "0x") return null;
  try {
    const d = decodeErrorResult({ abi: allErrorsAbi, data });
    return { errorName: d.errorName, args: d.args ?? [] };
  } catch {
    return null;
  }
}

function revertDataOf(e: ContractFunctionRevertedError): Hex | undefined {
  if (e.raw) return e.raw;
  const cause = (e as { cause?: { data?: Hex | { data?: Hex } } }).cause;
  const d = cause?.data;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.data === "string") return d.data;
  return undefined;
}

/** Normalises anything thrown by wagmi/viem/the wallet into a TxError. */
export function toTxError(e: unknown): TxError {
  if (e instanceof TxError) return e;
  if (e instanceof BaseError) {
    if (e.walk((err) => err instanceof UserRejectedRequestError)) return new TxError("rejected", "You rejected the request in your wallet.", { cause: e });
    if (e.walk((err) => err instanceof InsufficientFundsError)) return new TxError("insufficient-funds", "Not enough ETH on Robinhood Chain to cover this transaction and gas.", { cause: e });
    if (e.walk((err) => err instanceof ChainMismatchError || err instanceof SwitchChainError)) return new TxError("wrong-network", `Switch your wallet to ${activeChain.name} to continue.`, { cause: e });
    const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (reverted) {
      const decoded = reverted.data?.errorName ? { errorName: reverted.data.errorName, args: reverted.data.args ?? [] } : decodeRevertData(revertDataOf(reverted));
      if (decoded) {
        const d = describeContractError(decoded.errorName, decoded.args);
        return new TxError(d.code, d.message, { errorName: decoded.errorName, args: decoded.args, cause: e });
      }
      if (reverted.reason) return new TxError("reverted", `Transaction reverted: ${reverted.reason}`, { cause: e });
      return new TxError("reverted", "Transaction reverted by the contract.", { cause: e });
    }
    const short = e.shortMessage || e.message;
    if (/user (rejected|denied)|rejected the request/i.test(short)) return new TxError("rejected", "You rejected the request in your wallet.", { cause: e });
    if (/insufficient funds/i.test(short)) return new TxError("insufficient-funds", "Not enough ETH on Robinhood Chain to cover this transaction and gas.", { cause: e });
    if (/chain.*mismatch|wrong (chain|network)/i.test(short)) return new TxError("wrong-network", `Switch your wallet to ${activeChain.name} to continue.`, { cause: e });
    return new TxError("unknown", short, { cause: e });
  }
  const code = (e as { code?: number } | null)?.code;
  if (code === 4001) return new TxError("rejected", "You rejected the request in your wallet.", { cause: e });
  if (e instanceof Error) return new TxError("unknown", e.message, { cause: e });
  return new TxError("unknown", "Transaction failed.", { cause: e });
}
