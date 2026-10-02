// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Roles
/// @notice Canonical role identifiers shared by every contract in the system.
/// @dev All roles are administered by `ADMIN_ROLE` (OpenZeppelin `DEFAULT_ADMIN_ROLE`, i.e. `0x00`)
///      inside {AccessController}. Human roles: ADMIN, OPERATOR, PAUSER, TREASURER.
///      Contract roles (granted to contracts, never to EOAs): GAME, MINTER, REWARD_CREDITOR.
library Roles {
    /// @notice Two-step default admin (see AccessControlDefaultAdminRules). Grants/revokes every other role.
    bytes32 internal constant ADMIN_ROLE = 0x00;
    /// @notice Server that commits/reveals seeds and drives the round lifecycle.
    bytes32 internal constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    /// @notice May raise pause flags (lowering them is ADMIN only).
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    /// @notice May move earmarked treasury buckets (revenue, reserve, inventory, surplus) and fund reward inventory.
    bytes32 internal constant TREASURER_ROLE = keccak256("TREASURER_ROLE");
    /// @notice Held by {RouletteGame} only: reserve/release liability, escrow and settle on the treasury.
    bytes32 internal constant GAME_ROLE = keccak256("GAME_ROLE");
    /// @notice Held by {CasinoTreasury} only: mint/burn chips.
    bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// @notice Held by {CasinoTreasury} only: credit `winBalance` in {RewardVault}.
    bytes32 internal constant REWARD_CREDITOR_ROLE = keccak256("REWARD_CREDITOR_ROLE");
}
