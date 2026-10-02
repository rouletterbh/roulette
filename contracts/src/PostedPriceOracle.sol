// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title PostedPriceOracle
/// @notice Operator-posted USD prices for reward assets that have no onchain feed
///         (ecosystem tokens on Robinhood Chain). The operator service reads a
///         reference source (CoinGecko) and posts `(price, updatedAt)`.
///         Safety: prices are role-gated, timestamps are monotonic and never in the
///         future, each update is bounded by a max deviation from the previous price,
///         and {RewardVault} enforces its own per-asset staleness window on top.
///         A deviation breach must be acknowledged by ADMIN (`forcePrice`) so a bad
///         feed cannot silently reprice inventory. Swap for a TWAP/VRF-grade feed by
///         registering a different `IPriceOracle` on the vault; no vault change needed.
contract PostedPriceOracle is RoleGated, IPriceOracle {
    struct Posted {
        uint128 priceUsd1e18;
        uint64 updatedAt;
    }

    uint16 public constant MAX_DEVIATION_CAP = 5000; // 50%

    /// @dev Max allowed move per update, in bps of the previous price.
    uint16 public maxDeviationBps = 2000;
    mapping(address asset => Posted) private _prices;

    event PricePosted(address indexed asset, uint256 priceUsd1e18, uint256 updatedAt, address indexed poster);
    event PriceForced(address indexed asset, uint256 priceUsd1e18, uint256 updatedAt, address indexed admin);
    event PriceCleared(address indexed asset, address indexed admin);
    event MaxDeviationUpdated(uint16 previous, uint16 current);

    error ZeroPrice();
    error FutureTimestamp(uint256 updatedAt, uint256 blockTimestamp);
    error StaleUpdate(uint256 updatedAt, uint256 lastUpdatedAt);
    error DeviationTooLarge(address asset, uint256 previous, uint256 proposed, uint16 maxBps);
    error InvalidDeviation(uint16 bps);
    error LengthMismatch();

    constructor(address acl_) RoleGated(acl_) {}

    /// @inheritdoc IPriceOracle
    function getPrice(address asset) external view returns (uint256 priceUsd1e18, uint256 updatedAt) {
        Posted memory p = _prices[asset];
        return (p.priceUsd1e18, p.updatedAt);
    }

    /// @notice Post a price. Reverts when the move exceeds `maxDeviationBps` from the last posted price.
    function postPrice(address asset, uint256 priceUsd1e18, uint256 updatedAt) public onlyRole(Roles.OPERATOR_ROLE) {
        _validate(asset, priceUsd1e18, updatedAt);
        Posted memory prev = _prices[asset];
        if (prev.priceUsd1e18 != 0) {
            uint256 diff = priceUsd1e18 > prev.priceUsd1e18 ? priceUsd1e18 - prev.priceUsd1e18 : prev.priceUsd1e18 - priceUsd1e18;
            if (diff * 10_000 > uint256(prev.priceUsd1e18) * maxDeviationBps) {
                revert DeviationTooLarge(asset, prev.priceUsd1e18, priceUsd1e18, maxDeviationBps);
            }
        }
        _prices[asset] = Posted(uint128(priceUsd1e18), uint64(updatedAt));
        emit PricePosted(asset, priceUsd1e18, updatedAt, msg.sender);
    }

    /// @notice Batch post. Each entry is validated like {postPrice}.
    function postPrices(address[] calldata assets, uint256[] calldata prices, uint256[] calldata updatedAts)
        external
        onlyRole(Roles.OPERATOR_ROLE)
    {
        if (assets.length != prices.length || assets.length != updatedAts.length) revert LengthMismatch();
        for (uint256 i = 0; i < assets.length; i++) postPrice(assets[i], prices[i], updatedAts[i]);
    }

    /// @notice Admin override used only to acknowledge a genuine large move (or seed a first price).
    function forcePrice(address asset, uint256 priceUsd1e18, uint256 updatedAt) external onlyRole(Roles.ADMIN_ROLE) {
        _validate(asset, priceUsd1e18, updatedAt);
        _prices[asset] = Posted(uint128(priceUsd1e18), uint64(updatedAt));
        emit PriceForced(asset, priceUsd1e18, updatedAt, msg.sender);
    }

    /// @notice Clearing a price makes the vault report the asset UNAVAILABLE (price == 0).
    function clearPrice(address asset) external onlyRole(Roles.ADMIN_ROLE) {
        delete _prices[asset];
        emit PriceCleared(asset, msg.sender);
    }

    function setMaxDeviationBps(uint16 bps) external onlyRole(Roles.ADMIN_ROLE) {
        if (bps == 0 || bps > MAX_DEVIATION_CAP) revert InvalidDeviation(bps);
        emit MaxDeviationUpdated(maxDeviationBps, bps);
        maxDeviationBps = bps;
    }

    function _validate(address asset, uint256 priceUsd1e18, uint256 updatedAt) internal view {
        if (priceUsd1e18 == 0 || priceUsd1e18 > type(uint128).max) revert ZeroPrice();
        if (updatedAt > block.timestamp) revert FutureTimestamp(updatedAt, block.timestamp);
        uint256 last = _prices[asset].updatedAt;
        if (updatedAt < last) revert StaleUpdate(updatedAt, last);
    }
}
