// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IAccessController
/// @notice Minimal read surface the other contracts need from the central role registry.
interface IAccessController {
    function hasRole(bytes32 role, address account) external view returns (bool);
}
