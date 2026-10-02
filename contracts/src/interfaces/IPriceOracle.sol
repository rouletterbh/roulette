// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IPriceOracle
/// @notice Price feed adapter used by {RewardVault} to quote reward assets in USD.
/// @dev Implementations wrap a Chainlink-style aggregator, a Pyth feed, or an issuer NAV feed.
///      `priceUsd1e18` is the USD price of ONE WHOLE token (10^decimals base units), 18-decimal fixed point.
///      `updatedAt` is the unix timestamp of the last update; the vault enforces freshness.
interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256 priceUsd1e18, uint256 updatedAt);
}
