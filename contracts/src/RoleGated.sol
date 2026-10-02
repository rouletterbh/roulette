// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAccessController} from "./interfaces/IAccessController.sol";

/// @title RoleGated
/// @notice Mixin that checks roles against the shared {AccessController}.
/// @dev Roles live in ONE registry so a role change is a single transaction. `ACL` is immutable:
///      swapping the registry means redeploying, which is intentional (no silent re-keying).
abstract contract RoleGated {
    IAccessController public immutable ACL;

    error Unauthorized(bytes32 role, address account);
    error ZeroAddress();

    constructor(address acl_) {
        if (acl_ == address(0)) revert ZeroAddress();
        ACL = IAccessController(acl_);
    }

    modifier onlyRole(bytes32 role) {
        _checkRole(role, msg.sender);
        _;
    }

    function _checkRole(bytes32 role, address account) internal view {
        if (!ACL.hasRole(role, account)) revert Unauthorized(role, account);
    }
}
