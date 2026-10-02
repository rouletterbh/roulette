// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICasinoTreasury
/// @notice Surface used by {RouletteGame} (GAME role) plus the public solvency views.
interface ICasinoTreasury {
    /// @notice Wei per chip unit.
    function chipPriceWei() external view returns (uint256);

    /// @notice Hard cap on single-round liability as bps of available bankroll.
    function maxRoundExposureBps() external view returns (uint16);

    /// @notice bankroll - reserved - claimable - protocolReserve - safetyReserve (wei, floored at 0).
    function availableBankroll() external view returns (uint256);

    /// @notice availableBankroll() / chipPriceWei().
    function availableBankrollUnits() external view returns (uint256);

    /// @notice Reserve `units` of worst-case net payout. Reverts if it would exceed availableBankroll.
    function reserve(uint256 units) external;

    /// @notice Release previously reserved units.
    function release(uint256 units) external;

    /// @notice Burn `player`'s chips into the game's escrow pool. Returns units credited.
    function escrowIn(address player, uint256[] calldata ids, uint256[] calldata amounts) external returns (uint256 units);

    /// @notice Mint `units` of chips back to `player` out of the escrow pool.
    function escrowOut(address player, uint256 units) external;

    /// @notice Final accounting for a round: releases `releaseUnits` of reservation and moves the net
    ///         (returned - staked) between escrow liability and house equity.
    function settle(uint256 roundId, uint256 stakedUnits, uint256 returnedUnits, uint256 releaseUnits) external;
}
