// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {PostedPriceOracle} from "../src/PostedPriceOracle.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";
import {IRewardVault} from "../src/interfaces/IRewardVault.sol";

contract PostedPriceOracleTest is Fixture {
    PostedPriceOracle internal posted;
    address internal constant CASHCAT = address(0x020bfC650A365f8BB26819deAAbF3E21291018b4);

    function setUp() public {
        deployStack();
        posted = new PostedPriceOracle(address(acl));
        vm.warp(1_790_974_610);
    }

    function test_operatorPostsAndVaultReads() public {
        vm.prank(operator);
        posted.postPrice(CASHCAT, 0.160111e18, block.timestamp);
        (uint256 p, uint256 t) = posted.getPrice(CASHCAT);
        assertEq(p, 0.160111e18);
        assertEq(t, block.timestamp);
    }

    function test_strangerCannotPost() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        posted.postPrice(CASHCAT, 1e18, block.timestamp);
    }

    function test_rejectsZeroFutureAndStale() public {
        vm.startPrank(operator);
        vm.expectRevert(PostedPriceOracle.ZeroPrice.selector);
        posted.postPrice(CASHCAT, 0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.FutureTimestamp.selector, block.timestamp + 1, block.timestamp));
        posted.postPrice(CASHCAT, 1e18, block.timestamp + 1);
        posted.postPrice(CASHCAT, 1e18, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.StaleUpdate.selector, block.timestamp - 10, block.timestamp));
        posted.postPrice(CASHCAT, 1e18, block.timestamp - 10);
        vm.stopPrank();
    }

    function test_deviationGuardAndAdminOverride() public {
        vm.prank(operator);
        posted.postPrice(CASHCAT, 1e18, block.timestamp);
        vm.warp(block.timestamp + 60);
        // 20% default cap: 1.21 is a 21% move → revert; 1.19 passes.
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.DeviationTooLarge.selector, CASHCAT, 1e18, 1.21e18, uint16(2000)));
        posted.postPrice(CASHCAT, 1.21e18, block.timestamp);
        vm.prank(operator);
        posted.postPrice(CASHCAT, 1.19e18, block.timestamp);
        // admin acknowledges a genuine crash
        vm.warp(block.timestamp + 60);
        posted.forcePrice(CASHCAT, 0.3e18, block.timestamp);
        (uint256 p,) = posted.getPrice(CASHCAT);
        assertEq(p, 0.3e18);
        // operator cannot force
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, operator));
        posted.forcePrice(CASHCAT, 0.3e18, block.timestamp);
    }

    function test_batchPost() public {
        address[] memory a = new address[](2);
        uint256[] memory p = new uint256[](2);
        uint256[] memory t = new uint256[](2);
        a[0] = CASHCAT; a[1] = address(0xBEEF);
        p[0] = 0.16e18; p[1] = 0.45e18;
        t[0] = block.timestamp; t[1] = block.timestamp;
        vm.prank(operator);
        posted.postPrices(a, p, t);
        (uint256 p1,) = posted.getPrice(address(0xBEEF));
        assertEq(p1, 0.45e18);
    }

    function test_setMaxDeviationBounds() public {
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.InvalidDeviation.selector, uint16(0)));
        posted.setMaxDeviationBps(0);
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.InvalidDeviation.selector, uint16(5001)));
        posted.setMaxDeviationBps(5001);
        posted.setMaxDeviationBps(500);
        assertEq(posted.maxDeviationBps(), 500);
    }

    function test_vaultIntegration_statusFollowsPostedPrice() public {
        // Register the mock ERC-20 against the posted oracle and fund it.
        vault.registerAsset(
            address(token),
            RewardVault.AssetConfig({
                enabled: true,
                decimals: 18,
                maxStaleness: 15 minutes,
                oracle: address(posted),
                minimumPayoutUsd: 0.5e18,
                lowWatermark: 10e18
            })
        );
        fundVault(100e18);
        // no price yet → UNAVAILABLE
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "unavailable without price");
        vm.prank(operator);
        posted.postPrice(address(token), 0.5e18, block.timestamp);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.AVAILABLE, "available with fresh price");
        (uint256 out, uint256 price) = vault.quote(address(token), 1e18); // $1 → 2 tokens
        assertEq(price, 0.5e18);
        assertEq(out, 2e18);
        // staleness: 16 minutes later the vault refuses
        vm.warp(block.timestamp + 16 minutes);
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "stale");
        // admin clears → unavailable even if fresh timestamp was posted
        vm.prank(operator);
        posted.postPrice(address(token), 0.5e18, block.timestamp);
        posted.clearPrice(address(token));
        assertTrue(vault.status(address(token)) == RewardVault.AssetStatus.UNAVAILABLE, "cleared");
    }
}
