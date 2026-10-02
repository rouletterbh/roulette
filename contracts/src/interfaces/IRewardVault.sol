// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRewardVault
/// @notice Surface used by {CasinoTreasury} (REWARD_CREDITOR role).
interface IRewardVault {
    /// @notice Credit `usdAmount` (USD, 1e18 fixed point) of claimable rewards to `player`.
    function credit(address player, uint256 usdAmount) external;

    function winBalance(address player) external view returns (uint256);
}
