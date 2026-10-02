// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EmergencyPause} from "./EmergencyPause.sol";
import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";
import {IRewardVault} from "./interfaces/IRewardVault.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title RewardVault
/// @notice Holds reward inventory (ERC-20 ecosystem tokens and, where available, Stock Tokens) and the
///         per-player USD-denominated `winBalance` that can be claimed against it.
///
/// @dev ClaimManager is MERGED into this contract: a claim is a single atomic operation (quote,
///      decrement balance, transfer), so splitting it across two contracts would only add an extra
///      trust boundary without reducing risk. Registry-based: no token address is hardcoded; every
///      asset is registered by ADMIN with its own oracle, staleness bound, minimum payout and low
///      watermark. Only {CasinoTreasury} (REWARD_CREDITOR) can credit balances. Claims are pull
///      pattern, CEI, and a balance is decremented before the transfer so a claim can never execute
///      twice. Inventory withdrawals by TREASURER cannot touch `winBalance`, they only change
///      availability (status becomes LOW/UNAVAILABLE).
contract RewardVault is EmergencyPause, ReentrancyGuard, IRewardVault {
    using SafeERC20 for IERC20;

    uint32 public constant MIN_STALENESS = 30 seconds;
    uint32 public constant MAX_STALENESS = 7 days;
    uint8 public constant MAX_DECIMALS = 18;

    enum AssetStatus {
        UNAVAILABLE,
        LOW,
        AVAILABLE
    }

    struct AssetConfig {
        bool enabled;
        uint8 decimals;
        uint32 maxStaleness;
        address oracle;
        /// @dev USD 1e18. Claims below this are rejected.
        uint128 minimumPayoutUsd;
        /// @dev Base units. Inventory below this reports LOW.
        uint128 lowWatermark;
    }

    mapping(address asset => AssetConfig) private _assets;
    address[] private _assetList;

    mapping(address player => uint256) public winBalance;
    uint256 public totalWinBalance;
    uint256 public totalCreditedUsd;
    uint256 public totalClaimedUsd;
    mapping(address asset => uint256) public totalFunded;
    mapping(address asset => uint256) public totalClaimed;

    event AssetRegistered(address indexed asset, AssetConfig config);
    event AssetEnabled(address indexed asset, bool enabled);
    event Credited(address indexed player, uint256 usdAmount, uint256 newBalance, address indexed by);
    event Claimed(address indexed player, address indexed asset, uint256 usdAmount, uint256 amountOut, uint256 price);
    event InventoryFunded(address indexed asset, uint256 amount, address indexed by);
    event InventoryWithdrawn(address indexed asset, address indexed to, uint256 amount, address indexed by);

    error AssetNotRegistered(address asset);
    error AssetNotEnabled(address asset);
    error InvalidAssetConfig();
    error ZeroAmount();
    error DeadlineExpired(uint256 deadline, uint256 current);
    error BelowMinimumPayout(uint256 usdAmount, uint256 minimum);
    error InsufficientWinBalance(uint256 requested, uint256 balance);
    error StaleOracle(address asset, uint256 updatedAt, uint256 maxStaleness);
    error InvalidPrice(address asset);
    error SlippageExceeded(uint256 amountOut, uint256 minOut);
    error InsufficientInventory(address asset, uint256 required, uint256 available);

    constructor(address acl_) RoleGated(acl_) {}

    // ----------------------------------------------------------------- views

    function assetConfig(address asset) external view returns (AssetConfig memory) {
        return _assets[asset];
    }

    function assets() external view returns (address[] memory) {
        return _assetList;
    }

    function inventory(address asset) public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    /// @notice Liquidity status for the UI (mirrors `LiquidityStatus` in src/config/tokens.ts).
    function status(address asset) external view returns (AssetStatus) {
        AssetConfig memory a = _assets[asset];
        if (!a.enabled || a.oracle == address(0)) return AssetStatus.UNAVAILABLE;
        uint256 inv = inventory(asset);
        if (inv == 0) return AssetStatus.UNAVAILABLE;
        try IPriceOracle(a.oracle).getPrice(asset) returns (uint256 price, uint256 updatedAt) {
            if (price == 0 || block.timestamp - updatedAt > a.maxStaleness) return AssetStatus.UNAVAILABLE;
        } catch {
            return AssetStatus.UNAVAILABLE;
        }
        return inv < a.lowWatermark ? AssetStatus.LOW : AssetStatus.AVAILABLE;
    }

    /// @notice Token amount (base units) `usdAmount` buys at the current oracle price. Reverts if stale.
    function quote(address asset, uint256 usdAmount) public view returns (uint256 amountOut, uint256 price) {
        AssetConfig memory a = _assets[asset];
        if (a.oracle == address(0)) revert AssetNotRegistered(asset);
        uint256 updatedAt;
        (price, updatedAt) = IPriceOracle(a.oracle).getPrice(asset);
        if (price == 0) revert InvalidPrice(asset);
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > a.maxStaleness) {
            revert StaleOracle(asset, updatedAt, a.maxStaleness);
        }
        amountOut = usdAmount * (10 ** uint256(a.decimals)) / price;
    }

    // -------------------------------------------------------------- creditor

    /// @inheritdoc IRewardVault
    function credit(address player, uint256 usdAmount) external onlyRole(Roles.REWARD_CREDITOR_ROLE) {
        if (player == address(0)) revert ZeroAddress();
        if (usdAmount == 0) revert ZeroAmount();
        uint256 nb = winBalance[player] + usdAmount;
        winBalance[player] = nb;
        totalWinBalance += usdAmount;
        totalCreditedUsd += usdAmount;
        emit Credited(player, usdAmount, nb, msg.sender);
    }

    // ---------------------------------------------------------------- claims

    /// @notice Claim `usdAmount` of winBalance as `asset`.
    /// @param minOut Minimum token amount (base units) acceptable, protects against oracle moves.
    /// @param deadline Unix timestamp after which the claim is rejected.
    function claimAs(address asset, uint256 usdAmount, uint256 minOut, uint256 deadline)
        external
        whenNotPaused(PAUSE_CLAIMS)
        nonReentrant
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);
        AssetConfig memory a = _assets[asset];
        if (a.oracle == address(0)) revert AssetNotRegistered(asset);
        if (!a.enabled) revert AssetNotEnabled(asset);
        if (usdAmount == 0) revert ZeroAmount();
        if (usdAmount < a.minimumPayoutUsd) revert BelowMinimumPayout(usdAmount, a.minimumPayoutUsd);
        uint256 bal = winBalance[msg.sender];
        if (usdAmount > bal) revert InsufficientWinBalance(usdAmount, bal);

        uint256 price;
        (amountOut, price) = quote(asset, usdAmount);
        if (amountOut == 0) revert ZeroAmount();
        if (amountOut < minOut) revert SlippageExceeded(amountOut, minOut);
        uint256 inv = inventory(asset);
        if (amountOut > inv) revert InsufficientInventory(asset, amountOut, inv);

        // Effects before interaction: the balance is gone before any token moves.
        winBalance[msg.sender] = bal - usdAmount;
        totalWinBalance -= usdAmount;
        totalClaimedUsd += usdAmount;
        totalClaimed[asset] += amountOut;
        emit Claimed(msg.sender, asset, usdAmount, amountOut, price);

        IERC20(asset).safeTransfer(msg.sender, amountOut);
    }

    // ------------------------------------------------------------- treasurer

    /// @notice Pull `amount` of `asset` from the caller into inventory (caller must approve first).
    function fundInventory(address asset, uint256 amount) external onlyRole(Roles.TREASURER_ROLE) nonReentrant {
        if (_assets[asset].oracle == address(0)) revert AssetNotRegistered(asset);
        if (amount == 0) revert ZeroAmount();
        totalFunded[asset] += amount;
        emit InventoryFunded(asset, amount, msg.sender);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw inventory (e.g. to rotate assets). Does not affect any winBalance.
    function withdrawInventory(address asset, address to, uint256 amount)
        external
        onlyRole(Roles.TREASURER_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        emit InventoryWithdrawn(asset, to, amount, msg.sender);
        IERC20(asset).safeTransfer(to, amount);
    }

    // ----------------------------------------------------------------- admin

    function registerAsset(address asset, AssetConfig calldata config) external onlyRole(Roles.ADMIN_ROLE) {
        if (asset == address(0) || config.oracle == address(0)) revert ZeroAddress();
        if (
            config.decimals > MAX_DECIMALS || config.maxStaleness < MIN_STALENESS || config.maxStaleness > MAX_STALENESS
        ) revert InvalidAssetConfig();
        if (_assets[asset].oracle == address(0)) _assetList.push(asset);
        _assets[asset] = config;
        emit AssetRegistered(asset, config);
    }

    function setAssetEnabled(address asset, bool enabled) external onlyRole(Roles.ADMIN_ROLE) {
        if (_assets[asset].oracle == address(0)) revert AssetNotRegistered(asset);
        _assets[asset].enabled = enabled;
        emit AssetEnabled(asset, enabled);
    }
}
