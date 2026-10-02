// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EmergencyPause} from "./EmergencyPause.sol";
import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";
import {IChip1155} from "./interfaces/IChip1155.sol";
import {ICasinoTreasury} from "./interfaces/ICasinoTreasury.sol";
import {IRewardVault} from "./interfaces/IRewardVault.sol";

/// @title CasinoTreasury
/// @notice ETH custody, chip issuance and the solvency ledger. Nothing else in the system holds ETH.
///
/// @dev ACCOUNTING MODEL (all wei unless stated). Chips are game credits backed 1:1 by ETH:
///
///   payoutPool       ETH custodied for gameplay (deposit liquidity share + protocol reserve share
///                    + founder funding + realised house wins).
///   protocolReserve  earmark INSIDE payoutPool, never used for payouts (deposit reserve share).
///   claimable        earmark INSIDE payoutPool backing reward credits issued to {RewardVault}
///                    but not yet spent on inventory by the treasurer.
///   rewardInventory  ETH set aside to buy reward tokens (deposit inventory share). Separate bucket.
///   revenue          platform fee (deposit fee share). Separate bucket.
///   withdrawable     pull-payment credits (redemptions, treasurer withdrawals). Separate bucket.
///
///   chipLiabilityUnits = CHIP.totalUnits() + escrowUnits        (chips in wallets + chips in play)
///   chipLiability      = chipLiabilityUnits * chipPriceWei
///   bankroll           = payoutPool - chipLiability              <- "bankroll" in engine.ts (house equity)
///   reservedLiability  = reservedUnits * chipPriceWei            <- worst-case net payout of open rounds
///   safetyReserve      = bankroll * safetyReserveBps / 10_000
///   availableBankroll  = bankroll - reservedLiability - claimable - protocolReserve - safetyReserve
///
/// INVARIANTS (checked in `isSolvent()`, asserted after every state-changing accounting path,
/// and fuzzed in test/invariants/TreasuryInvariants.t.sol):
///   I1  assets >= liabilities:
///       address(this).balance >= payoutPool + rewardInventory + revenue + totalWithdrawable
///   I2  payoutPool >= chipLiability + reservedLiability + claimable + protocolReserve
///   I3  reservedLiability >= maximum outstanding net payout of every open round (the game only
///       accepts a wager after RiskEngine.checkWager passes AND `reserve()` succeeds)
///   I4  withdrawable surplus <= bankroll - liabilities (see `surplus()`)
///
/// Why chips are minted only for the payout-liquidity share: minting chips for the full deposit
/// while routing 30% of it to inventory/reserve/fee would make every deposit reduce house equity,
/// and the founders will not top up. With this model a deposit is solvency-neutral and only
/// founder capital plus realised house edge is ever at risk. See README "Solvency model".
contract CasinoTreasury is EmergencyPause, ReentrancyGuard, ICasinoTreasury {
    uint16 public constant BPS = 10_000;

    // Safe bounds, mirrors economicsBounds in src/config/economics.ts
    uint16 public constant MIN_PAYOUT_LIQUIDITY_BPS = 5000;
    uint16 public constant MAX_PAYOUT_LIQUIDITY_BPS = 9000;
    uint16 public constant MAX_REWARD_INVENTORY_BPS = 4000;
    uint16 public constant MAX_PROTOCOL_RESERVE_BPS = 2000;
    uint16 public constant MAX_PLATFORM_FEE_BPS = 500;
    uint16 public constant MIN_SAFETY_RESERVE_BPS = 500;
    uint16 public constant MAX_SAFETY_RESERVE_BPS = 5000;
    uint16 public constant MIN_ROUND_EXPOSURE_BPS = 500;
    uint16 public constant MAX_ROUND_EXPOSURE_BPS = 5000;

    struct SplitConfig {
        uint16 payoutLiquidityBps;
        uint16 rewardInventoryBps;
        uint16 protocolReserveBps;
        uint16 platformFeeBps;
    }

    struct RiskConfig {
        uint16 safetyReserveBps;
        uint16 maxRoundExposureBps;
    }

    enum Bucket {
        Revenue,
        RewardInventory,
        ProtocolReserve,
        Claimable,
        Surplus
    }

    IChip1155 public immutable CHIP;
    IRewardVault public rewardVault;

    SplitConfig public splitConfig;
    RiskConfig public riskConfig;

    /// @notice Wei per chip unit.
    uint256 public chipPriceWei;
    /// @notice USD value (1e18 fixed) credited to RewardVault per chip unit converted.
    uint256 public chipUsdValue;

    uint256 public payoutPool;
    uint256 public protocolReserve;
    uint256 public rewardInventory;
    uint256 public revenue;
    uint256 public claimable;
    uint256 public reservedUnits;
    uint256 public escrowUnits;

    mapping(address account => uint256) public withdrawable;
    uint256 public totalWithdrawable;

    // ---------------------------------------------------------------- events

    event Deposited(
        address indexed player,
        uint256 value,
        uint256 units,
        uint256 liquidity,
        uint256 inventory,
        uint256 reserve,
        uint256 fee
    );
    event BankrollFunded(address indexed from, uint256 value);
    event Redeemed(address indexed player, uint256 units, uint256 value);
    event ConvertedToRewards(address indexed player, uint256 units, uint256 value, uint256 usdAmount);
    event WithdrawableCredited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event LiabilityReserved(uint256 units, uint256 totalReservedUnits);
    event LiabilityReleased(uint256 units, uint256 totalReservedUnits);
    event EscrowIn(address indexed player, uint256 units, uint256 totalEscrowUnits);
    event EscrowOut(address indexed player, uint256 units, uint256 totalEscrowUnits);
    event RoundSettled(uint256 indexed roundId, uint256 stakedUnits, uint256 returnedUnits, uint256 releasedUnits);
    event BucketWithdrawn(Bucket indexed bucket, address indexed to, uint256 amount, address indexed by);
    event SplitConfigUpdated(SplitConfig config);
    event RiskConfigUpdated(RiskConfig config);
    event ChipPriceUpdated(uint256 previous, uint256 current);
    event ChipUsdValueUpdated(uint256 previous, uint256 current);
    event RewardVaultUpdated(address previous, address current);

    // ---------------------------------------------------------------- errors

    error ZeroAmount();
    error DepositTooSmall(uint256 value, uint256 chipPriceWei);
    error InsufficientBankroll(uint256 required, uint256 available);
    error ReleaseExceedsReserved(uint256 units, uint256 reserved);
    error PayoutExceedsReservation(uint256 netPayoutUnits, uint256 reservedUnits);
    error EscrowUnderflow(uint256 units, uint256 escrow);
    error BucketUnderflow(Bucket bucket, uint256 amount, uint256 balance);
    error ExceedsSurplus(uint256 amount, uint256 surplus);
    error NothingToWithdraw();
    error TransferFailed(address to, uint256 amount);
    error InvalidSplit(SplitConfig config);
    error InvalidRiskConfig(RiskConfig config);
    error InvalidPrice();
    error RewardVaultNotSet();
    error SolvencyViolation();

    constructor(
        address acl_,
        address chip_,
        uint256 chipPriceWei_,
        uint256 chipUsdValue_,
        SplitConfig memory split_,
        RiskConfig memory risk_
    ) RoleGated(acl_) {
        if (chip_ == address(0)) revert ZeroAddress();
        CHIP = IChip1155(chip_);
        _setChipPrice(chipPriceWei_);
        _setChipUsdValue(chipUsdValue_);
        _setSplit(split_);
        _setRisk(risk_);
    }

    // ----------------------------------------------------------------- views

    /// @inheritdoc ICasinoTreasury
    function maxRoundExposureBps() public view returns (uint16) {
        return riskConfig.maxRoundExposureBps;
    }

    function safetyReserveBps() public view returns (uint16) {
        return riskConfig.safetyReserveBps;
    }

    /// @notice Chips in wallets + chips in play (units).
    function chipLiabilityUnits() public view returns (uint256) {
        return CHIP.totalUnits() + escrowUnits;
    }

    function chipLiability() public view returns (uint256) {
        return chipLiabilityUnits() * chipPriceWei;
    }

    function reservedLiability() public view returns (uint256) {
        return reservedUnits * chipPriceWei;
    }

    /// @notice House equity available for payouts: payoutPool - chipLiability. ("bankroll" in engine.ts)
    function bankroll() public view returns (uint256) {
        uint256 cl = chipLiability();
        return payoutPool > cl ? payoutPool - cl : 0;
    }

    function safetyReserve() public view returns (uint256) {
        return bankroll() * riskConfig.safetyReserveBps / BPS;
    }

    /// @notice reservedLiability + claimable + protocolReserve (chip liability already netted in bankroll()).
    function liabilities() public view returns (uint256) {
        return reservedLiability() + claimable + protocolReserve;
    }

    /// @inheritdoc ICasinoTreasury
    function availableBankroll() public view returns (uint256) {
        uint256 b = bankroll();
        uint256 l = liabilities() + safetyReserve();
        return b > l ? b - l : 0;
    }

    /// @inheritdoc ICasinoTreasury
    function availableBankrollUnits() external view returns (uint256) {
        return availableBankroll() / chipPriceWei;
    }

    /// @notice Treasurer-withdrawable house profit: bankroll - liabilities (I4).
    function surplus() public view returns (uint256) {
        uint256 b = bankroll();
        uint256 l = liabilities();
        return b > l ? b - l : 0;
    }

    /// @notice I1 and I2 together.
    function isSolvent() public view returns (bool) {
        bool i1 = address(this).balance >= payoutPool + rewardInventory + revenue + totalWithdrawable;
        bool i2 = payoutPool >= chipLiability() + reservedLiability() + claimable + protocolReserve;
        return i1 && i2;
    }

    // --------------------------------------------------------------- players

    /// @notice Buy chips. Value is split per `splitConfig`; chips are minted for the liquidity share.
    function deposit() external payable whenNotPaused(PAUSE_DEPOSITS) nonReentrant {
        uint256 value = msg.value;
        if (value == 0) revert ZeroAmount();
        SplitConfig memory s = splitConfig;
        uint256 liquidity = value * s.payoutLiquidityBps / BPS;
        uint256 inventory = value * s.rewardInventoryBps / BPS;
        uint256 reserve_ = value * s.protocolReserveBps / BPS;
        uint256 fee = value - liquidity - inventory - reserve_;
        uint256 units = liquidity / chipPriceWei;
        if (units == 0) revert DepositTooSmall(value, chipPriceWei);

        // Effects. Dust (liquidity - units * chipPriceWei) stays in payoutPool as house equity.
        payoutPool += liquidity + reserve_;
        protocolReserve += reserve_;
        rewardInventory += inventory;
        revenue += fee;
        emit Deposited(msg.sender, value, units, liquidity, inventory, reserve_, fee);

        // Interaction (trusted contract; may call onERC1155BatchReceived on a contract depositor).
        CHIP.mintValue(msg.sender, units);
        _assertSolvent();
    }

    /// @notice Capital injection with no chips minted (founder funding, house equity). Never paused.
    function fundBankroll() public payable {
        if (msg.value == 0) revert ZeroAmount();
        payoutPool += msg.value;
        emit BankrollFunded(msg.sender, msg.value);
    }

    receive() external payable {
        fundBankroll();
    }

    /// @notice Burn chips for ETH at `chipPriceWei`. Pull payment: credits `withdrawable`, then `withdraw()`.
    /// @dev Caller must have `setApprovalForAll(treasury, true)` on the chip contract.
    function redeem(uint256[] calldata ids, uint256[] calldata amounts)
        external
        whenNotPaused(PAUSE_WITHDRAWALS)
        nonReentrant
    {
        uint256 units = CHIP.totalValue(ids, amounts);
        if (units == 0) revert ZeroAmount();
        uint256 value = units * chipPriceWei;
        if (value > payoutPool) revert InsufficientBankroll(value, payoutPool);

        payoutPool -= value;
        _credit(msg.sender, value);
        emit Redeemed(msg.sender, units, value);

        CHIP.batchBurn(msg.sender, ids, amounts); // reverts on missing balance / approval
        _assertSolvent();
    }

    /// @notice Burn chips and credit USD-equivalent `winBalance` in the RewardVault instead of ETH.
    /// @dev The ETH that backed those chips is moved to the `claimable` earmark until the treasurer
    ///      spends it on reward inventory via `fundRewards`.
    function convertToRewards(uint256[] calldata ids, uint256[] calldata amounts)
        external
        whenNotPaused(PAUSE_CLAIMS)
        nonReentrant
    {
        if (address(rewardVault) == address(0)) revert RewardVaultNotSet();
        uint256 units = CHIP.totalValue(ids, amounts);
        if (units == 0) revert ZeroAmount();
        uint256 value = units * chipPriceWei;
        uint256 usd = units * chipUsdValue;

        claimable += value;
        emit ConvertedToRewards(msg.sender, units, value, usd);

        CHIP.batchBurn(msg.sender, ids, amounts);
        rewardVault.credit(msg.sender, usd);
        _assertSolvent();
    }

    /// @notice Pull any ETH credited to the caller. The only ETH exit in the system.
    function withdraw() external whenNotPaused(PAUSE_WITHDRAWALS) nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        totalWithdrawable -= amount;
        emit Withdrawn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed(msg.sender, amount);
    }

    // ------------------------------------------------------------------ game

    /// @inheritdoc ICasinoTreasury
    function reserve(uint256 units) external onlyRole(Roles.GAME_ROLE) {
        uint256 value = units * chipPriceWei;
        uint256 available = availableBankroll();
        if (value > available) revert InsufficientBankroll(value, available);
        reservedUnits += units;
        emit LiabilityReserved(units, reservedUnits);
    }

    /// @inheritdoc ICasinoTreasury
    function release(uint256 units) external onlyRole(Roles.GAME_ROLE) {
        if (units > reservedUnits) revert ReleaseExceedsReserved(units, reservedUnits);
        reservedUnits -= units;
        emit LiabilityReleased(units, reservedUnits);
    }

    /// @inheritdoc ICasinoTreasury
    function escrowIn(address player, uint256[] calldata ids, uint256[] calldata amounts)
        external
        onlyRole(Roles.GAME_ROLE)
        returns (uint256 units)
    {
        units = CHIP.batchBurn(player, ids, amounts);
        escrowUnits += units;
        emit EscrowIn(player, units, escrowUnits);
    }

    /// @inheritdoc ICasinoTreasury
    function escrowOut(address player, uint256 units) external onlyRole(Roles.GAME_ROLE) {
        if (units == 0) revert ZeroAmount();
        if (units > escrowUnits) revert EscrowUnderflow(units, escrowUnits);
        escrowUnits -= units;
        emit EscrowOut(player, units, escrowUnits);
        CHIP.mintValue(player, units);
    }

    /// @inheritdoc ICasinoTreasury
    function settle(uint256 roundId, uint256 stakedUnits, uint256 returnedUnits, uint256 releaseUnits)
        external
        onlyRole(Roles.GAME_ROLE)
    {
        if (releaseUnits > reservedUnits) revert ReleaseExceedsReserved(releaseUnits, reservedUnits);
        reservedUnits -= releaseUnits;
        if (returnedUnits > stakedUnits) {
            uint256 net = returnedUnits - stakedUnits;
            // A payout can never exceed what was reserved for the round (I3).
            if (net > releaseUnits) revert PayoutExceedsReservation(net, releaseUnits);
            escrowUnits += net;
        } else {
            uint256 net = stakedUnits - returnedUnits;
            if (net > escrowUnits) revert EscrowUnderflow(net, escrowUnits);
            escrowUnits -= net; // house win: chips burned, ETH stays in payoutPool as equity
        }
        emit RoundSettled(roundId, stakedUnits, returnedUnits, releaseUnits);
        _assertSolvent();
    }

    // ------------------------------------------------------------- treasurer

    function withdrawRevenue(address to, uint256 amount) external onlyRole(Roles.TREASURER_ROLE) {
        if (amount > revenue) revert BucketUnderflow(Bucket.Revenue, amount, revenue);
        revenue -= amount;
        _bucketOut(Bucket.Revenue, to, amount);
    }

    function withdrawRewardInventory(address to, uint256 amount) external onlyRole(Roles.TREASURER_ROLE) {
        if (amount > rewardInventory) revert BucketUnderflow(Bucket.RewardInventory, amount, rewardInventory);
        rewardInventory -= amount;
        _bucketOut(Bucket.RewardInventory, to, amount);
    }

    function withdrawProtocolReserve(address to, uint256 amount) external onlyRole(Roles.TREASURER_ROLE) {
        if (amount > protocolReserve) revert BucketUnderflow(Bucket.ProtocolReserve, amount, protocolReserve);
        protocolReserve -= amount;
        payoutPool -= amount;
        _bucketOut(Bucket.ProtocolReserve, to, amount);
    }

    /// @notice Draw ETH earmarked for reward obligations to purchase inventory for the RewardVault.
    function fundRewards(address to, uint256 amount) external onlyRole(Roles.TREASURER_ROLE) {
        if (amount > claimable) revert BucketUnderflow(Bucket.Claimable, amount, claimable);
        claimable -= amount;
        payoutPool -= amount;
        _bucketOut(Bucket.Claimable, to, amount);
    }

    /// @notice Withdraw realised house profit, bounded by `surplus()` (I4).
    function withdrawSurplus(address to, uint256 amount) external onlyRole(Roles.TREASURER_ROLE) {
        uint256 s = surplus();
        if (amount > s) revert ExceedsSurplus(amount, s);
        payoutPool -= amount;
        _bucketOut(Bucket.Surplus, to, amount);
    }

    // ----------------------------------------------------------------- admin

    function setSplitConfig(SplitConfig calldata config) external onlyRole(Roles.ADMIN_ROLE) {
        _setSplit(config);
    }

    function setRiskConfig(RiskConfig calldata config) external onlyRole(Roles.ADMIN_ROLE) {
        _setRisk(config);
    }

    /// @dev Re-prices every outstanding chip; only allowed if the treasury stays solvent at the new price.
    function setChipPriceWei(uint256 price) external onlyRole(Roles.ADMIN_ROLE) {
        _setChipPrice(price);
        _assertSolvent();
    }

    function setChipUsdValue(uint256 value) external onlyRole(Roles.ADMIN_ROLE) {
        _setChipUsdValue(value);
    }

    function setRewardVault(address vault) external onlyRole(Roles.ADMIN_ROLE) {
        if (vault == address(0)) revert ZeroAddress();
        emit RewardVaultUpdated(address(rewardVault), vault);
        rewardVault = IRewardVault(vault);
    }

    // -------------------------------------------------------------- internal

    function _credit(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        withdrawable[to] += amount;
        totalWithdrawable += amount;
        emit WithdrawableCredited(to, amount);
    }

    function _bucketOut(Bucket bucket, address to, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        _credit(to, amount);
        emit BucketWithdrawn(bucket, to, amount, msg.sender);
        _assertSolvent();
    }

    function _assertSolvent() internal view {
        if (!isSolvent()) revert SolvencyViolation();
    }

    function _setSplit(SplitConfig memory c) internal {
        uint256 total = uint256(c.payoutLiquidityBps) + c.rewardInventoryBps + c.protocolReserveBps + c.platformFeeBps;
        if (
            total != BPS || c.payoutLiquidityBps < MIN_PAYOUT_LIQUIDITY_BPS
                || c.payoutLiquidityBps > MAX_PAYOUT_LIQUIDITY_BPS || c.rewardInventoryBps > MAX_REWARD_INVENTORY_BPS
                || c.protocolReserveBps > MAX_PROTOCOL_RESERVE_BPS || c.platformFeeBps > MAX_PLATFORM_FEE_BPS
        ) revert InvalidSplit(c);
        splitConfig = c;
        emit SplitConfigUpdated(c);
    }

    function _setRisk(RiskConfig memory c) internal {
        if (
            c.safetyReserveBps < MIN_SAFETY_RESERVE_BPS || c.safetyReserveBps > MAX_SAFETY_RESERVE_BPS
                || c.maxRoundExposureBps < MIN_ROUND_EXPOSURE_BPS || c.maxRoundExposureBps > MAX_ROUND_EXPOSURE_BPS
        ) revert InvalidRiskConfig(c);
        riskConfig = c;
        emit RiskConfigUpdated(c);
    }

    function _setChipPrice(uint256 price) internal {
        if (price == 0) revert InvalidPrice();
        emit ChipPriceUpdated(chipPriceWei, price);
        chipPriceWei = price;
    }

    function _setChipUsdValue(uint256 value) internal {
        if (value == 0) revert InvalidPrice();
        emit ChipUsdValueUpdated(chipUsdValue, value);
        chipUsdValue = value;
    }
}
