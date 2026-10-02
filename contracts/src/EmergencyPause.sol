// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";

/// @title EmergencyPause
/// @notice Granular pause flags (deposits, gameplay, claims, withdrawals) as a bitmask.
/// @dev Each inheriting contract carries its own flags; gate functions with `whenNotPaused(FLAG)`.
///      Asymmetric authority: PAUSER may only RAISE flags (fast incident response, low-trust key);
///      only ADMIN may LOWER them (deliberate recovery). Pausing is always temporary and never
///      moves funds: it cannot take player escrow, alter outcomes, or change a submitted wager.
abstract contract EmergencyPause is RoleGated {
    uint8 public constant PAUSE_DEPOSITS = 1 << 0;
    uint8 public constant PAUSE_GAMEPLAY = 1 << 1;
    uint8 public constant PAUSE_CLAIMS = 1 << 2;
    uint8 public constant PAUSE_WITHDRAWALS = 1 << 3;
    uint8 public constant PAUSE_ALL = PAUSE_DEPOSITS | PAUSE_GAMEPLAY | PAUSE_CLAIMS | PAUSE_WITHDRAWALS;

    /// @notice Currently raised flags.
    uint8 public pauseFlags;

    event PauseFlagsUpdated(uint8 previous, uint8 current, address indexed by);

    error EnforcedPause(uint8 flag);
    error InvalidPauseFlags(uint8 flags);

    modifier whenNotPaused(uint8 flag) {
        if (pauseFlags & flag != 0) revert EnforcedPause(flag);
        _;
    }

    /// @notice Raise one or more flags. PAUSER only.
    function pause(uint8 flags) external onlyRole(Roles.PAUSER_ROLE) {
        if (flags == 0 || flags & ~PAUSE_ALL != 0) revert InvalidPauseFlags(flags);
        _setPauseFlags(pauseFlags | flags);
    }

    /// @notice Lower one or more flags. ADMIN only.
    function unpause(uint8 flags) external onlyRole(Roles.ADMIN_ROLE) {
        if (flags == 0 || flags & ~PAUSE_ALL != 0) revert InvalidPauseFlags(flags);
        _setPauseFlags(pauseFlags & ~flags);
    }

    function isPaused(uint8 flag) external view returns (bool) {
        return pauseFlags & flag != 0;
    }

    function _setPauseFlags(uint8 next) internal {
        uint8 prev = pauseFlags;
        pauseFlags = next;
        emit PauseFlagsUpdated(prev, next, msg.sender);
    }
}
