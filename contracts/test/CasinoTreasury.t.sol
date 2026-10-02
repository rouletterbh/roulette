// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {MaliciousReceiver} from "./utils/Mocks.sol";
import {CasinoTreasury} from "../src/CasinoTreasury.sol";
import {EmergencyPause} from "../src/EmergencyPause.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";

contract CasinoTreasuryTest is Fixture {
    function setUp() public {
        deployStack();
        fundHouse(100 ether);
    }

    // --------------------------------------------------------------- deposits

    function test_deposit_splitsPerConfigAndMintsChips() public {
        uint256 units = buyChips(alice, 10 ether);

        assertEq(units, 7000, "chips minted for the 70% liquidity share");
        assertEq(treasury.payoutPool(), 100 ether + 7 ether + 0.8 ether);
        assertEq(treasury.protocolReserve(), 0.8 ether);
        assertEq(treasury.rewardInventory(), 2 ether);
        assertEq(treasury.revenue(), 0.2 ether);
        assertEq(treasury.chipLiability(), 7 ether);
        assertEq(treasury.bankroll(), 100.8 ether, "bankroll = payoutPool - chipLiability");
        assertEq(address(treasury).balance, 110 ether);
        assertTrue(treasury.isSolvent());
    }

    function test_deposit_isSolvencyNeutral() public {
        uint256 availableBefore = treasury.availableBankroll();
        buyChips(alice, 50 ether);
        // reserve share is earmarked and safety grows with it; chips are fully backed.
        assertLe(treasury.availableBankroll(), availableBefore + 1);
        assertGe(treasury.availableBankroll() + treasury.safetyReserve(), availableBefore);
        assertTrue(treasury.isSolvent());
    }

    function test_deposit_feeIsRemainderSoSplitSumsExactly() public {
        buyChips(alice, 1 ether + 3);
        uint256 v = 1 ether + 3;
        uint256 liq = v * 7000 / 10_000;
        uint256 inv = v * 2000 / 10_000;
        uint256 res = v * 800 / 10_000;
        assertEq(treasury.revenue(), v - liq - inv - res);
        assertEq(treasury.payoutPool() + treasury.rewardInventory() + treasury.revenue(), 100 ether + v);
    }

    function test_deposit_tooSmallReverts() public {
        vm.deal(alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CasinoTreasury.DepositTooSmall.selector, 1, CHIP_PRICE));
        treasury.deposit{value: 1}();
    }

    function test_deposit_zeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(CasinoTreasury.ZeroAmount.selector);
        treasury.deposit{value: 0}();
    }

    function test_deposit_pausedReverts() public {
        vm.prank(pauser);
        treasury.pause(PAUSE_DEPOSITS);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.EnforcedPause.selector, uint8(1)));
        treasury.deposit{value: 1 ether}();
    }

    function test_fundBankroll_viaReceive() public {
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        (bool ok,) = address(treasury).call{value: 5 ether}("");
        assertTrue(ok);
        assertEq(treasury.payoutPool(), 105 ether);
        assertEq(chip.totalUnits(), 0, "funding mints nothing");
    }

    // -------------------------------------------------------------- redeem

    function test_redeem_creditsWithdrawableAndBurns() public {
        buyChips(alice, 10 ether);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(alice);

        vm.prank(alice);
        treasury.redeem(ids, amts);

        assertEq(treasury.withdrawable(alice), 7 ether);
        assertEq(treasury.totalWithdrawable(), 7 ether);
        assertEq(chip.totalUnits(), 0);
        assertEq(treasury.payoutPool(), 100 ether + 0.8 ether);
        assertTrue(treasury.isSolvent());

        uint256 before = alice.balance;
        vm.prank(alice);
        treasury.withdraw();
        assertEq(alice.balance - before, 7 ether);
        assertEq(treasury.withdrawable(alice), 0);
        assertEq(treasury.totalWithdrawable(), 0);
    }

    function test_redeem_withoutApprovalReverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        treasury.deposit{value: 1 ether}(); // no setApprovalForAll
        (uint256[] memory ids, uint256[] memory amts) = heldChips(bob);
        vm.prank(bob);
        vm.expectRevert();
        treasury.redeem(ids, amts);
    }

    function test_redeem_pausedWithdrawalsReverts() public {
        buyChips(alice, 1 ether);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(alice);
        vm.prank(pauser);
        treasury.pause(PAUSE_WITHDRAWALS);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.EnforcedPause.selector, uint8(8)));
        treasury.redeem(ids, amts);
    }

    function test_withdraw_nothingReverts() public {
        vm.prank(alice);
        vm.expectRevert(CasinoTreasury.NothingToWithdraw.selector);
        treasury.withdraw();
    }

    function test_withdraw_reentrancyAttemptFails() public {
        MaliciousReceiver m = new MaliciousReceiver(treasury);
        vm.deal(address(this), 10 ether);
        m.deposit{value: 10 ether}();
        m.approveChips(address(chip));
        (uint256[] memory ids, uint256[] memory amts) = heldChips(address(m));
        m.redeem(ids, amts);
        assertEq(treasury.withdrawable(address(m)), 7 ether);

        uint256 treasuryBefore = address(treasury).balance;
        vm.expectRevert(abi.encodeWithSelector(CasinoTreasury.TransferFailed.selector, address(m), 7 ether));
        m.withdraw(true);
        assertEq(treasury.withdrawable(address(m)), 7 ether, "state untouched after failed attack");
        assertEq(address(treasury).balance, treasuryBefore);

        m.withdraw(false);
        assertEq(address(m).balance, 7 ether);
        assertEq(treasury.withdrawable(address(m)), 0);
    }

    // ------------------------------------------------------- reserve / release

    function test_reserve_onlyGame() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.GAME_ROLE, stranger));
        treasury.reserve(1);
    }

    function test_reserve_undercollateralizedReverts() public {
        acl.grantRole(Roles.GAME_ROLE, address(this));
        uint256 available = treasury.availableBankroll();
        uint256 units = available / CHIP_PRICE + 1;
        vm.expectRevert(
            abi.encodeWithSelector(CasinoTreasury.InsufficientBankroll.selector, units * CHIP_PRICE, available)
        );
        treasury.reserve(units);
    }

    function test_reserve_release_accounting() public {
        acl.grantRole(Roles.GAME_ROLE, address(this));
        uint256 availableBefore = treasury.availableBankroll();
        treasury.reserve(1000);
        assertEq(treasury.reservedUnits(), 1000);
        assertEq(treasury.reservedLiability(), 1000 * CHIP_PRICE);
        assertEq(treasury.availableBankroll(), availableBefore - 1000 * CHIP_PRICE);
        treasury.release(400);
        assertEq(treasury.reservedUnits(), 600);
        vm.expectRevert(abi.encodeWithSelector(CasinoTreasury.ReleaseExceedsReserved.selector, 601, 600));
        treasury.release(601);
    }

    function test_settle_payoutBeyondReservationReverts() public {
        acl.grantRole(Roles.GAME_ROLE, address(this));
        treasury.reserve(100);
        vm.expectRevert(abi.encodeWithSelector(CasinoTreasury.PayoutExceedsReservation.selector, 101, 100));
        treasury.settle(1, 10, 111, 100);
    }

    function test_settle_houseWinReducesEscrowLiability() public {
        seatPlayer(alice, 10 ether); // 7000 units in escrow
        acl.grantRole(Roles.GAME_ROLE, address(this));
        uint256 bankrollBefore = treasury.bankroll();
        treasury.reserve(350);
        treasury.settle(1, 10, 0, 350);
        assertEq(treasury.escrowUnits(), 6990);
        assertEq(treasury.reservedUnits(), 0);
        assertEq(treasury.bankroll(), bankrollBefore + 10 * CHIP_PRICE, "house equity grows by the lost stake");
        assertTrue(treasury.isSolvent());
    }

    function test_settle_playerWinIncreasesEscrowLiability() public {
        seatPlayer(alice, 10 ether);
        acl.grantRole(Roles.GAME_ROLE, address(this));
        uint256 bankrollBefore = treasury.bankroll();
        treasury.reserve(350);
        treasury.settle(1, 10, 360, 350);
        assertEq(treasury.escrowUnits(), 7350);
        assertEq(treasury.bankroll(), bankrollBefore - 350 * CHIP_PRICE);
        assertTrue(treasury.isSolvent());
    }

    // ----------------------------------------------------------- treasurer

    function test_treasurer_bucketWithdrawalsBounded() public {
        buyChips(alice, 10 ether);
        vm.startPrank(treasurer);
        treasury.withdrawRevenue(treasurer, 0.2 ether);
        vm.expectRevert(
            abi.encodeWithSelector(CasinoTreasury.BucketUnderflow.selector, CasinoTreasury.Bucket.Revenue, 1, 0)
        );
        treasury.withdrawRevenue(treasurer, 1);
        treasury.withdrawRewardInventory(treasurer, 2 ether);
        treasury.withdrawProtocolReserve(treasurer, 0.8 ether);
        vm.stopPrank();
        assertEq(treasury.withdrawable(treasurer), 3 ether);
        assertEq(treasury.protocolReserve(), 0);
        assertEq(treasury.payoutPool(), 107 ether);
        assertTrue(treasury.isSolvent());
    }

    function test_treasurer_surplusBoundedByFormula() public {
        buyChips(alice, 10 ether);
        uint256 s = treasury.surplus();
        assertEq(s, treasury.bankroll() - treasury.liabilities());
        vm.prank(treasurer);
        vm.expectRevert(abi.encodeWithSelector(CasinoTreasury.ExceedsSurplus.selector, s + 1, s));
        treasury.withdrawSurplus(treasurer, s + 1);
        vm.prank(treasurer);
        treasury.withdrawSurplus(treasurer, s);
        assertEq(treasury.surplus(), 0);
        assertTrue(treasury.isSolvent(), "chips remain fully backed after taking all surplus");
    }

    function test_treasurer_cannotTouchPlayerBackedPool() public {
        buyChips(alice, 10 ether);
        // withdraw every surplus wei, then try to take one more from any path.
        uint256 s = treasury.surplus();
        vm.startPrank(treasurer);
        treasury.withdrawSurplus(treasurer, s);
        vm.expectRevert(abi.encodeWithSelector(CasinoTreasury.ExceedsSurplus.selector, 1, 0));
        treasury.withdrawSurplus(treasurer, 1);
        vm.stopPrank();
        assertGe(treasury.payoutPool(), treasury.chipLiability());
    }

    function test_treasurer_roleRequired() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.TREASURER_ROLE, stranger));
        treasury.withdrawSurplus(stranger, 1);
    }

    function test_fundRewards_drawsDownClaimable() public {
        buyChips(alice, 10 ether);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(alice);
        vm.prank(alice);
        treasury.convertToRewards(ids, amts);
        assertEq(treasury.claimable(), 7 ether);
        assertEq(vault.winBalance(alice), 7000 * CHIP_USD);
        assertEq(chip.totalUnits(), 0);

        vm.prank(treasurer);
        treasury.fundRewards(treasurer, 7 ether);
        assertEq(treasury.claimable(), 0);
        assertEq(treasury.withdrawable(treasurer), 7 ether);
        assertTrue(treasury.isSolvent());
    }

    // ---------------------------------------------------------------- admin

    function test_setSplit_mustSumAndStayInBounds() public {
        vm.expectRevert();
        treasury.setSplitConfig(CasinoTreasury.SplitConfig(7000, 2000, 800, 300)); // sums to 10100
        vm.expectRevert();
        treasury.setSplitConfig(CasinoTreasury.SplitConfig(4000, 4000, 1500, 500)); // liquidity below 5000
        vm.expectRevert();
        treasury.setSplitConfig(CasinoTreasury.SplitConfig(5000, 4100, 400, 500)); // inventory above 4000
        treasury.setSplitConfig(CasinoTreasury.SplitConfig(9000, 500, 300, 200));
        (uint16 liq,,,) = treasury.splitConfig();
        assertEq(liq, 9000);
    }

    function test_setRisk_bounds() public {
        vm.expectRevert();
        treasury.setRiskConfig(CasinoTreasury.RiskConfig(400, 2500));
        vm.expectRevert();
        treasury.setRiskConfig(CasinoTreasury.RiskConfig(1500, 5001));
        treasury.setRiskConfig(CasinoTreasury.RiskConfig(500, 5000));
        assertEq(treasury.maxRoundExposureBps(), 5000);
    }

    function test_setChipPrice_cannotBreakSolvency() public {
        buyChips(alice, 100 ether); // 70_000 units backed by 70 ether; equity 100.8 ether
        // Tripling the price would make chip liability 210 ether > payoutPool 178 ether.
        vm.expectRevert(CasinoTreasury.SolvencyViolation.selector);
        treasury.setChipPriceWei(3e15);
        treasury.setChipPriceWei(2e15);
        assertTrue(treasury.isSolvent());
        vm.expectRevert(CasinoTreasury.InvalidPrice.selector);
        treasury.setChipPriceWei(0);
    }

    function test_adminSetters_roleRequired() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, stranger));
        treasury.setChipPriceWei(1);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, stranger));
        treasury.setRewardVault(stranger);
        vm.stopPrank();
    }

    // -------------------------------------------------------- solvency views

    function test_availableBankroll_matchesFormula() public {
        buyChips(alice, 10 ether);
        acl.grantRole(Roles.GAME_ROLE, address(this));
        treasury.reserve(500);
        uint256 b = treasury.bankroll();
        uint256 expected = b - treasury.reservedLiability() - treasury.claimable() - treasury.protocolReserve()
            - b * 1500 / 10_000;
        assertEq(treasury.availableBankroll(), expected);
        assertEq(treasury.availableBankrollUnits(), expected / CHIP_PRICE);
    }

    function test_limitsExpandWithBankroll() public {
        uint256 before = treasury.availableBankrollUnits();
        fundHouse(100 ether);
        assertEq(treasury.availableBankrollUnits(), before + 85_000);
    }
}
