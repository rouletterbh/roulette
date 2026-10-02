// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ScriptBase} from "./utils/ScriptBase.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title FundRewards
/// @notice Moves reward inventory from the TREASURER wallet into the vault. Run with the
///         treasurer key. Amounts are base units (18 decimals for all three assets).
/// Env: VAULT, AMOUNT_CASHCAT, AMOUNT_PONS, AMOUNT_AI (any may be 0 to skip)
contract FundRewards is ScriptBase {
    address constant CASHCAT = 0x020bfC650A365f8BB26819deAAbF3E21291018b4;
    address constant PONS = 0x39dBED3a2bd333467115dE45665cC57F813C4571;
    address constant AI = 0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18;

    function run() external {
        RewardVault vault = RewardVault(vm.envAddress("VAULT"));
        vm.startBroadcast();
        _fund(vault, CASHCAT, vm.envOr("AMOUNT_CASHCAT", uint256(0)));
        _fund(vault, PONS, vm.envOr("AMOUNT_PONS", uint256(0)));
        _fund(vault, AI, vm.envOr("AMOUNT_AI", uint256(0)));
        vm.stopBroadcast();
    }

    function _fund(RewardVault vault, address asset, uint256 amount) internal {
        if (amount == 0) return;
        IERC20(asset).approve(address(vault), amount);
        vault.fundInventory(asset, amount);
    }
}
