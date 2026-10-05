import { describe, it, expect } from "vitest";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, encodeErrorResult } from "viem";
import { allErrorsAbi, casinoTreasuryAbi, riskEngineAbi, rouletteGameAbi } from "./contracts";
import { decodeRevertData, describeContractError, toTxError } from "./errors";

describe("custom error decoding", () => {
  it("decodes ExposureCapExceeded raw revert data (bubbled from RiskEngine through RouletteGame)", () => {
    const data = encodeErrorResult({ abi: riskEngineAbi, errorName: "ExposureCapExceeded", args: [350n, 212n] });
    expect(decodeRevertData(data)).toEqual({ errorName: "ExposureCapExceeded", args: [350n, 212n] });
    const reverted = new ContractFunctionRevertedError({ abi: rouletteGameAbi, functionName: "placeBets", data });
    const err = toTxError(new BaseError("simulate failed", { cause: reverted }));
    expect(err.code).toBe("table-limit");
    expect(err.message).toMatch(/350.*212/);
    expect(err.errorName).toBe("ExposureCapExceeded");
  });

  it("decodes errors declared on the game ABI itself", () => {
    const data = encodeErrorResult({ abi: rouletteGameAbi, errorName: "InvalidRoundStatus", args: [7n, 2, 1] });
    const reverted = new ContractFunctionRevertedError({ abi: rouletteGameAbi, functionName: "placeBets", data });
    const err = toTxError(reverted);
    expect(err.code).toBe("round-not-open");
    expect(err.message).toMatch(/Round 7 is closed/);
    const paused = toTxError(new ContractFunctionRevertedError({ abi: rouletteGameAbi, functionName: "enterTable", data: encodeErrorResult({ abi: rouletteGameAbi, errorName: "EnforcedPause", args: [2] }) }));
    expect(paused.code).toBe("paused");
  });

  it("maps wallet rejection, unknown reverts and plain errors", () => {
    expect(toTxError(new UserRejectedRequestError(new Error("denied"))).code).toBe("rejected");
    expect(toTxError({ code: 4001, message: "User rejected" }).code).toBe("rejected");
    expect(toTxError(new Error("boom")).code).toBe("unknown");
    expect(decodeRevertData("0x")).toBeNull();
    expect(decodeRevertData("0xdeadbeef")).toBeNull();
  });

  it("has copy for every error we expect from gameplay and cashier flows", () => {
    for (const name of ["ExposureCapExceeded", "InsufficientEscrow", "StakeOutOfRange", "InvalidRoundStatus", "EnforcedPause", "ERC1155MissingApprovalForAll", "DepositTooSmall", "NothingToWithdraw", "StaleOracle", "SlippageExceeded", "InsufficientInventory", "DeadlineExpired", "BelowMinimumPayout", "InsufficientWinBalance"]) {
      const d = describeContractError(name, [1n, 2n, 3n, 4n]);
      expect(d.code).not.toBe("unknown");
      expect(d.message.length).toBeGreaterThan(10);
    }
    expect(describeContractError("SomethingNew", [5n]).message).toContain("SomethingNew");
  });

  it("has copy for the collect flow: convertToRewards and claimAs reverts", () => {
    expect(describeContractError("RewardVaultNotSet")).toMatchObject({ code: "rewards-unavailable" });
    expect(describeContractError("RewardVaultNotSet").message).toMatch(/chips are unchanged/);
    expect(describeContractError("SolvencyViolation").code).toBe("rewards-unavailable");
    // EnforcedPause carries the blocking flag: 4 is PAUSE_CLAIMS, which gates both convertToRewards and claimAs.
    expect(describeContractError("EnforcedPause", [4]).message).toMatch(/Conversions and claims are paused/);
    expect(describeContractError("EnforcedPause", [2]).message).toMatch(/Leave table/);
    expect(describeContractError("EnforcedPause", [1]).message).toMatch(/Deposits/);
    expect(describeContractError("EnforcedPause", [8]).message).toMatch(/Withdrawals/);
    // InsufficientInventory(asset, required, available)
    expect(describeContractError("InsufficientInventory", ["0x0", 5n, 0n]).message).toMatch(/being restocked/);
    expect(describeContractError("InsufficientInventory", ["0x0", 5n, 3n]).message).toMatch(/up to the maximum shown/);
    const data = encodeErrorResult({ abi: casinoTreasuryAbi, errorName: "RewardVaultNotSet" });
    expect(toTxError(new ContractFunctionRevertedError({ abi: casinoTreasuryAbi, functionName: "convertToRewards", data })).code).toBe("rewards-unavailable");
    const paused = encodeErrorResult({ abi: casinoTreasuryAbi, errorName: "EnforcedPause", args: [4] });
    expect(toTxError(new ContractFunctionRevertedError({ abi: casinoTreasuryAbi, functionName: "convertToRewards", data: paused })).message).toMatch(/Conversions and claims/);
  });

  it("merges every error from the deployed ABIs without duplicates by signature", () => {
    const names = allErrorsAbi.map((e) => (e.type === "error" ? e.name : ""));
    expect(names).toContain("ExposureCapExceeded");
    expect(names).toContain("SlippageExceeded");
    expect(names.filter((n) => n === "ZeroAmount").length).toBe(1);
  });
});
