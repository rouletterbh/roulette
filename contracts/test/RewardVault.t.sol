// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {MockERC20} from "./utils/Mocks.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {EmergencyPause} from "../src/EmergencyPause.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";

contract RewardVaultTest is Fixture {
    uint256 internal deadline;

    function setUp() public {
        deployStack();
        fundHouse(100 ether);
        registerMockAsset(); // $2 / token, 18 decimals, min payout $1, low watermark 10 tokens
        fundVault(10_000e18);
        deadline = block.timestamp + 1 hours;

        // alice converts 7000 chip units into $7000 of winBalance
        buyChips(alice, 10 ether);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(alice);
        vm.prank(alice);
        treasury.convertToRewards(ids, amts);
        assertEq(vault.winBalance(alice), 7000e18);
    }

    // ---------------------------------------------------------------- credit

    function test_credit_onlyCreditorRole() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.REWARD_CREDITOR_ROLE, stranger));
        vault.credit(alice, 1e18);
    }

    function test_credit_tracksTotals() public view {
        assertEq(vault.totalWinBalance(), 7000e18);
        assertEq(vault.totalCreditedUsd(), 7000e18);
    }

    // ----------------------------------------------------------------- claims

    function test_claimAs_quotesAtOraclePriceAndDecrementsFirst() public {
        vm.prank(alice);
        uint256 out = vault.claimAs(address(token), 10e18, 4e18, deadline);
        assertEq(out, 5e18, "$10 at $2 = 5 tokens");
        assertEq(token.balanceOf(alice), 5e18);
        assertEq(vault.winBalance(alice), 6990e18);
        assertEq(vault.totalWinBalance(), 6990e18);
        assertEq(vault.totalClaimedUsd(), 10e18);
        assertEq(vault.totalClaimed(address(token)), 5e18);
    }

    function test_claim_cannotExecuteTwice() public {
        vm.startPrank(alice);
        vault.claimAs(address(token), 7000e18, 0, deadline);
        assertEq(vault.winBalance(alice), 0);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.InsufficientWinBalance.selector, 7000e18, 0));
        vault.claimAs(address(token), 7000e18, 0, deadline);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 3500e18);
    }

    function test_claim_staleOracleReverts() public {
        uint256 old = block.timestamp - 2 hours;
        oracle.set(address(token), 2e18, old);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.StaleOracle.selector, address(token), old, uint32(1 hours)));
        vault.claimAs(address(token), 10e18, 0, deadline);
    }

    function test_claim_futureOracleTimestampReverts() public {
        oracle.set(address(token), 2e18, block.timestamp + 10);
        vm.prank(alice);
        vm.expectRevert();
        vault.claimAs(address(token), 10e18, 0, deadline);
    }

    function test_claim_zeroPriceReverts() public {
        oracle.set(address(token), 0, block.timestamp);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.InvalidPrice.selector, address(token)));
        vault.claimAs(address(token), 10e18, 0, deadline);
    }

    function test_claim_invalidTokenReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.AssetNotRegistered.selector, address(0xDEAD)));
        vault.claimAs(address(0xDEAD), 10e18, 0, deadline);
    }

    function test_claim_disabledAssetReverts() public {
        vault.setAssetEnabled(address(token), false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.AssetNotEnabled.selector, address(token)));
        vault.claimAs(address(token), 10e18, 0, deadline);
    }

    function test_claim_slippageReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.SlippageExceeded.selector, 5e18, 6e18));
        vault.claimAs(address(token), 10e18, 6e18, deadline);
    }

    function test_claim_deadlineReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(RewardVault.DeadlineExpired.selector, block.timestamp - 1, block.timestamp)
        );
        vault.claimAs(address(token), 10e18, 0, block.timestamp - 1);
    }

    function test_claim_belowMinimumReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.BelowMinimumPayout.selector, 0.5e18, 1e18));
        vault.claimAs(address(token), 0.5e18, 0, deadline);
    }

    function test_claim_insufficientInventoryReverts() public {
        vm.prank(treasurer);
        vault.withdrawInventory(address(token), treasurer, 10_000e18 - 1e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.InsufficientInventory.selector, address(token), 5e18, 1e18));
        vault.claimAs(address(token), 10e18, 0, deadline);
        assertEq(vault.winBalance(alice), 7000e18, "balance untouched by a failed claim");
    }

    function test_claim_pausedReverts() public {
        vm.prank(pauser);
        vault.pause(PAUSE_CLAIMS);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.EnforcedPause.selector, uint8(4)));
        vault.claimAs(address(token), 10e18, 0, deadline);
    }

    function test_claim_sixDecimalAsset() public {
        MockERC20 usdc = new MockERC20("Six", "SIX", 6);
        oracle.set(address(usdc), 150e18, block.timestamp); // $150 / token
        vault.registerAsset(
            address(usdc),
            RewardVault.AssetConfig({
                enabled: true,
                decimals: 6,
                maxStaleness: 1 hours,
                oracle: address(oracle),
                minimumPayoutUsd: 1e18,
                lowWatermark: 0
            })
        );
        usdc.mint(treasurer, 100e6);
        vm.startPrank(treasurer);
        usdc.approve(address(vault), 100e6);
        vault.fundInventory(address(usdc), 100e6);
        vm.stopPrank();

        (uint256 q,) = vault.quote(address(usdc), 300e18);
        assertEq(q, 2e6);
        vm.prank(alice);
        uint256 out = vault.claimAs(address(usdc), 300e18, 2e6, deadline);
        assertEq(out, 2e6);
        assertEq(usdc.balanceOf(alice), 2e6);
    }

    // ----------------------------------------------------------------- status

    function test_status_transitions() public {
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.AVAILABLE);

        vm.prank(treasurer);
        vault.withdrawInventory(address(token), treasurer, 10_000e18 - 5e18);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.LOW, "below watermark");

        vm.prank(treasurer);
        vault.withdrawInventory(address(token), treasurer, 5e18);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "empty");

        fundVault(100e18);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.AVAILABLE);

        oracle.set(address(token), 2e18, block.timestamp - 2 hours);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "stale");
        oracle.set(address(token), 2e18, block.timestamp);

        oracle.setRevert(true);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "oracle down");
        oracle.setRevert(false);

        vault.setAssetEnabled(address(token), false);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "disabled");

        assertTrue(vault.status(address(0xDEAD)) == RewardVault.AssetStatus.UNAVAILABLE, "unknown");
    }

    // ----------------------------------------------------------------- admin

    function test_registerAsset_boundsAndRole() public {
        RewardVault.AssetConfig memory cfg = RewardVault.AssetConfig({
            enabled: true,
            decimals: 18,
            maxStaleness: 1 hours,
            oracle: address(oracle),
            minimumPayoutUsd: 0,
            lowWatermark: 0
        });
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, stranger));
        vault.registerAsset(address(0x1), cfg);

        cfg.oracle = address(0);
        vm.expectRevert(RoleGated.ZeroAddress.selector);
        vault.registerAsset(address(0x1), cfg);
        cfg.oracle = address(oracle);

        cfg.maxStaleness = 10;
        vm.expectRevert(RewardVault.InvalidAssetConfig.selector);
        vault.registerAsset(address(0x1), cfg);
        cfg.maxStaleness = 8 days;
        vm.expectRevert(RewardVault.InvalidAssetConfig.selector);
        vault.registerAsset(address(0x1), cfg);
        cfg.maxStaleness = 1 hours;

        cfg.decimals = 19;
        vm.expectRevert(RewardVault.InvalidAssetConfig.selector);
        vault.registerAsset(address(0x1), cfg);
        cfg.decimals = 18;

        vault.registerAsset(address(0x1), cfg);
        assertEq(vault.assets().length, 2);
        vault.registerAsset(address(0x1), cfg); // update, not duplicated
        assertEq(vault.assets().length, 2);
    }

    function test_fundInventory_requiresTreasurerAndRegistration() public {
        token.mint(stranger, 1e18);
        vm.startPrank(stranger);
        token.approve(address(vault), 1e18);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.TREASURER_ROLE, stranger));
        vault.fundInventory(address(token), 1e18);
        vm.stopPrank();

        vm.prank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.AssetNotRegistered.selector, address(0xDEAD)));
        vault.fundInventory(address(0xDEAD), 1);
        assertEq(vault.totalFunded(address(token)), 10_000e18);
    }

    function test_withdrawInventory_neverTouchesWinBalances() public {
        vm.prank(treasurer);
        vault.withdrawInventory(address(token), treasurer, 10_000e18);
        assertEq(vault.winBalance(alice), 7000e18);
        assertEq(vault.totalWinBalance(), 7000e18);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.TREASURER_ROLE, stranger));
        vault.withdrawInventory(address(token), stranger, 1);
    }

    function test_claimsNeverExceedFunded() public {
        vm.prank(alice);
        vault.claimAs(address(token), 7000e18, 0, deadline);
        assertLe(vault.totalClaimed(address(token)), vault.totalFunded(address(token)));
        assertLe(vault.totalClaimedUsd(), vault.totalCreditedUsd());
    }
}
