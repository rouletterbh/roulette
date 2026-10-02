// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Roles} from "./Roles.sol";

/// @title AccessController
/// @notice Single role registry for the platform. Every other contract queries `hasRole` here.
/// @dev Two-step, delayed admin transfer via OpenZeppelin `AccessControlDefaultAdminRules`:
///      the current admin calls `beginDefaultAdminTransfer(newAdmin)`, the delay elapses, then
///      `newAdmin` calls `acceptDefaultAdminTransfer()`. There is never more than one admin.
///      On mainnet the admin MUST be a multisig (see README "Mainnet checklist").
contract AccessController is AccessControlDefaultAdminRules {
    bytes32 public constant OPERATOR_ROLE = Roles.OPERATOR_ROLE;
    bytes32 public constant PAUSER_ROLE = Roles.PAUSER_ROLE;
    bytes32 public constant TREASURER_ROLE = Roles.TREASURER_ROLE;
    bytes32 public constant GAME_ROLE = Roles.GAME_ROLE;
    bytes32 public constant MINTER_ROLE = Roles.MINTER_ROLE;
    bytes32 public constant REWARD_CREDITOR_ROLE = Roles.REWARD_CREDITOR_ROLE;

    /// @param initialAdmin First default admin (deployer on testnet, multisig on mainnet).
    /// @param adminTransferDelay Seconds a pending admin transfer must wait before acceptance.
    constructor(address initialAdmin, uint48 adminTransferDelay)
        AccessControlDefaultAdminRules(adminTransferDelay, initialAdmin)
    {}
}
