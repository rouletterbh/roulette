// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {RouletteGame} from "../src/RouletteGame.sol";
import {CasinoTreasury} from "../src/CasinoTreasury.sol";
import {EmergencyPause} from "../src/EmergencyPause.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";
import {IRiskEngine} from "../src/interfaces/IRiskEngine.sol";

contract RouletteGameTest is Fixture {
    bytes32 internal constant SEED = keccak256("server-seed-42");

    function setUp() public {
        deployStack();
        fundHouse(100 ether);
        seatPlayer(alice, 10 ether); // 7000 units in escrow
        seatPlayer(bob, 10 ether); // 7000 units in escrow
    }

    // ------------------------------------------------------------- open round

    function test_openRound_requiresCommitment() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.CommitmentRequired.selector, 1));
        game.openRound(1, tableId);
    }

    function test_openRound_requiresOperator() public {
        commitRound(1, SEED);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        game.openRound(1, tableId);
    }

    function test_openRound_inactiveTableReverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.TableNotActive.selector, uint32(99)));
        game.openRound(1, 99);
    }

    function test_openRound_sameIdTwiceReverts() public {
        openRound(1, SEED);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                RouletteGame.InvalidRoundStatus.selector, 1, RouletteGame.RoundStatus.Open, RouletteGame.RoundStatus.None
            )
        );
        game.openRound(1, tableId);
    }

    function test_openRound_requiresMinimumBankroll() public {
        game.setMinBankrollToOpen(1e9);
        commitRound(1, SEED);
        uint256 available = treasury.availableBankrollUnits();
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.InsufficientBankrollToOpen.selector, available, 1e9));
        game.openRound(1, tableId);
    }

    // -------------------------------------------------------------- place bets

    function test_placeBets_debitsEscrowAndReservesLiability() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(17), 35, 10)));

        assertEq(game.escrow(alice), 6990);
        RouletteGame.Round memory r = game.getRound(1);
        assertEq(r.betCount, 1);
        assertEq(r.totalStaked, 10);
        assertEq(r.reservedUnits, 350);
        assertEq(treasury.reservedUnits(), 350);
        assertEq(game.getBets(1).length, 1);
        assertEq(game.getBets(1)[0].player, alice);
    }

    function test_placeBets_undercollateralizedWagerReverts() public {
        openRound(1, SEED);
        uint256 cap = treasury.availableBankrollUnits() * 2500 / 10_000;
        assertLt(cap, 35_000, "fixture: a 1000-unit straight must exceed the cap");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRiskEngine.ExposureCapExceeded.selector, 35_000, cap));
        game.placeBets(1, one(bet(straightMask(7), 35, 1000)));

        assertEq(treasury.reservedUnits(), 0, "nothing reserved");
        assertEq(game.escrow(alice), 7000, "nothing debited");
        assertEq(game.getRound(1).betCount, 0);
    }

    function test_placeBets_capAppliesToWholeRoundNotPerPlayer() public {
        openRound(1, SEED);
        uint256 cap = treasury.availableBankrollUnits() * 2500 / 10_000;
        uint128 half = uint128(cap / 35 / 2 + 1); // two of these exceed the cap together
        placeAs(alice, 1, one(bet(straightMask(7), 35, half)));
        vm.prank(bob);
        vm.expectRevert();
        game.placeBets(1, one(bet(straightMask(7), 35, half)));
    }

    function test_placeBets_hedgedBetsReleaseReservation() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(risk.MASK_RED(), 1, 100)));
        assertEq(treasury.reservedUnits(), 100);
        placeAs(bob, 1, one(bet(risk.MASK_BLACK(), 1, 100)));
        assertEq(treasury.reservedUnits(), 0, "red + black net liability is zero");
        assertEq(game.getRound(1).reservedUnits, 0);
    }

    function test_placeBets_stakeOutOfTableRange() public {
        openRound(1, SEED);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.StakeOutOfRange.selector, 0, uint128(10_001), uint128(1), uint128(10_000)));
        game.placeBets(1, one(bet(risk.MASK_RED(), 1, 10_001)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.StakeOutOfRange.selector, 0, uint128(0), uint128(1), uint128(10_000)));
        game.placeBets(1, one(bet(risk.MASK_RED(), 1, 0)));
    }

    function test_placeBets_insufficientEscrow() public {
        openRound(1, SEED);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.InsufficientEscrow.selector, 7001, 7000));
        game.placeBets(1, one(bet(risk.MASK_RED(), 1, 7001)));
    }

    function test_placeBets_invalidGeometryReverts() public {
        openRound(1, SEED);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRiskEngine.InvalidBet.selector, 0));
        game.placeBets(1, one(bet(straightMask(7), 36, 1)));
    }

    function test_placeBets_afterCloseReverts() public {
        openRound(1, SEED);
        closeRound(1);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                RouletteGame.InvalidRoundStatus.selector, 1, RouletteGame.RoundStatus.Closed, RouletteGame.RoundStatus.Open
            )
        );
        game.placeBets(1, one(bet(risk.MASK_RED(), 1, 1)));
    }

    function test_placeBets_noBetsReverts() public {
        openRound(1, SEED);
        IRiskEngine.Bet[] memory none = new IRiskEngine.Bet[](0);
        vm.prank(alice);
        vm.expectRevert(IRiskEngine.NoBets.selector);
        game.placeBets(1, none);
    }

    function test_placeBets_maxBetsPerRound() public {
        game.setMaxBetsPerRound(2);
        openRound(1, SEED);
        IRiskEngine.Bet[] memory three = new IRiskEngine.Bet[](3);
        three[0] = bet(straightMask(1), 35, 1);
        three[1] = bet(straightMask(2), 35, 1);
        three[2] = bet(straightMask(3), 35, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.TooManyBets.selector, 3, 2));
        game.placeBets(1, three);
    }

    function test_placeBets_gameplayPaused() public {
        openRound(1, SEED);
        vm.prank(pauser);
        game.pause(game.PAUSE_GAMEPLAY());
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.EnforcedPause.selector, uint8(2)));
        game.placeBets(1, one(bet(risk.MASK_RED(), 1, 1)));
    }

    // ------------------------------------------------------------- settlement

    function test_settle_creditsWinnersReleasesReservationAndSettlesTreasury() public {
        openRound(1, SEED);
        IRiskEngine.Bet[] memory bets = new IRiskEngine.Bet[](3);
        bets[0] = bet(risk.MASK_RED(), 1, 10);
        bets[1] = bet(risk.MASK_BLACK(), 1, 10);
        bets[2] = bet(straightMask(0), 35, 10);
        placeAs(alice, 1, bets);
        assertEq(treasury.reservedUnits(), 330, "worst case is zero: 360 - 30 staked");

        uint8 result = closeAndReveal(1, SEED);
        game.settleRound(1);

        uint256 returned = result == 0 ? 360 : 20;
        RouletteGame.Round memory r = game.getRound(1);
        assertTrue(r.status == RouletteGame.RoundStatus.Settled);
        assertEq(r.result, result);
        assertEq(r.totalReturned, returned);
        assertEq(r.reservedUnits, 0);
        assertEq(game.escrow(alice), 7000 - 30 + returned);
        assertEq(treasury.reservedUnits(), 0);
        assertEq(treasury.escrowUnits(), 14_000 - 30 + returned);
        assertTrue(treasury.isSolvent());
    }

    function test_settle_fullCoverageIsDeterministic() public {
        openRound(1, SEED);
        IRiskEngine.Bet[] memory bets = new IRiskEngine.Bet[](37);
        for (uint8 n; n < 37; ++n) bets[n] = bet(straightMask(n), 35, 1);
        placeAs(alice, 1, bets);
        assertEq(treasury.reservedUnits(), 0, "36 returned on 37 staked never costs the house");
        uint256 bankrollBefore = treasury.bankroll();

        closeAndReveal(1, SEED);
        game.settleRound(1);

        assertEq(game.escrow(alice), 7000 - 37 + 36);
        assertEq(treasury.bankroll(), bankrollBefore + CHIP_PRICE, "house edge realised");
    }

    function test_settle_twiceReverts() public {
        playRound(1, SEED, alice, one(bet(risk.MASK_RED(), 1, 10)));
        vm.expectRevert(
            abi.encodeWithSelector(
                RouletteGame.InvalidRoundStatus.selector, 1, RouletteGame.RoundStatus.Settled, RouletteGame.RoundStatus.Closed
            )
        );
        game.settleRound(1);
    }

    function test_settle_beforeRevealReverts() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(risk.MASK_RED(), 1, 10)));
        closeRound(1);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.ResultNotAvailable.selector, 1));
        game.settleRound(1);
    }

    function test_settle_openRoundReverts() public {
        openRound(1, SEED);
        vm.expectRevert(
            abi.encodeWithSelector(
                RouletteGame.InvalidRoundStatus.selector, 1, RouletteGame.RoundStatus.Open, RouletteGame.RoundStatus.Closed
            )
        );
        game.settleRound(1);
    }

    function test_settle_anyoneCanCall() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(risk.MASK_RED(), 1, 10)));
        closeAndReveal(1, SEED);
        vm.prank(stranger);
        game.settleRound(1);
        assertTrue(game.getRound(1).status == RouletteGame.RoundStatus.Settled);
    }

    function test_closeRound_requiresOperatorAndOpen() public {
        openRound(1, SEED);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        game.closeRound(1);
        closeRound(1);
        vm.prank(operator);
        vm.expectRevert();
        game.closeRound(1);
    }

    // ------------------------------------------------------------------ void

    function test_void_expiredWindowRefundsEveryStake() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(5), 35, 10)));
        placeAs(bob, 1, one(bet(risk.MASK_RED(), 1, 20)));
        closeRound(1);
        vm.roll(randomness.revealAfterBlock(1) + 300);

        vm.prank(stranger);
        game.voidRound(1);

        assertTrue(game.getRound(1).status == RouletteGame.RoundStatus.Voided);
        assertEq(game.escrow(alice), 7000);
        assertEq(game.escrow(bob), 7000);
        assertEq(treasury.reservedUnits(), 0);
        assertEq(treasury.escrowUnits(), 14_000);
        assertTrue(treasury.isSolvent());
    }

    function test_void_viaSettleWhenRandomnessVoid() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(5), 35, 10)));
        closeRound(1);
        vm.roll(randomness.revealAfterBlock(1) + 300);
        vm.prank(operator);
        randomness.reveal(1, SEED); // late reveal voids on the randomness side
        game.settleRound(1);
        assertTrue(game.getRound(1).status == RouletteGame.RoundStatus.Voided);
        assertEq(game.escrow(alice), 7000);
    }

    function test_void_beforeWindowExpiresReverts() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(5), 35, 10)));
        closeRound(1);
        vm.roll(randomness.revealAfterBlock(1) + 10);
        vm.expectRevert();
        game.voidRound(1);
    }

    function test_void_abandonedOpenRoundAfterTimeout() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(5), 35, 10)));
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.RoundNotVoidable.selector, 1));
        game.voidRound(1);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(stranger);
        game.voidRound(1);
        assertEq(game.escrow(alice), 7000);
        assertEq(treasury.reservedUnits(), 0);
    }

    function test_voidedRoundCannotBeSettled() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(5), 35, 10)));
        closeRound(1);
        vm.roll(randomness.revealAfterBlock(1) + 300);
        game.voidRound(1);
        vm.expectRevert();
        game.settleRound(1);
        vm.expectRevert();
        game.voidRound(1);
    }

    function test_cancelRound_onlyWhileOpen() public {
        openRound(1, SEED);
        placeAs(alice, 1, one(bet(straightMask(5), 35, 10)));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        game.cancelRound(1);

        vm.prank(operator);
        game.cancelRound(1);
        assertEq(game.escrow(alice), 7000);
        assertTrue(game.getRound(1).status == RouletteGame.RoundStatus.Voided);

        openRound(2, SEED);
        closeRound(2);
        vm.prank(operator);
        vm.expectRevert(); // entropy may exist after close: cancellation is not allowed
        game.cancelRound(2);
    }

    // ---------------------------------------------------------------- escrow

    function test_leaveTable_mintsChipsBack() public {
        vm.prank(alice);
        game.leaveTable(500);
        assertEq(game.escrow(alice), 6500);
        assertEq(chipUnitsOf(alice), 500);
        assertEq(treasury.escrowUnits(), 13_500);
        assertEq(treasury.chipLiabilityUnits(), 14_000, "liability unchanged by escrow moves");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.InsufficientEscrow.selector, 7000, 6500));
        game.leaveTable(7000);
    }

    function test_leaveTable_worksWhileGameplayPaused() public {
        vm.prank(pauser);
        game.pause(game.PAUSE_ALL());
        vm.prank(alice);
        game.leaveTable(7000);
        assertEq(chipUnitsOf(alice), 7000);
    }

    function test_enterTable_pausedReverts() public {
        buyChips(carol, 1 ether);
        vm.prank(pauser);
        game.pause(game.PAUSE_GAMEPLAY());
        (uint256[] memory ids, uint256[] memory amts) = heldChips(carol);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.EnforcedPause.selector, uint8(2)));
        game.enterTable(ids, amts);
    }

    function test_escrowCannotBeMovedByAdmin() public {
        // The only paths that change escrow are the player's own calls and settlement.
        // Pausing everything leaves balances untouched and leaveTable still works (see above).
        vm.prank(pauser);
        game.pause(game.PAUSE_ALL());
        assertEq(game.escrow(alice), 7000);
        assertEq(game.escrow(bob), 7000);
    }

    // ------------------------------------------------------------------ misc

    function test_maxStakeFor_tracksBankroll() public {
        uint256 before = game.maxStakeFor(35);
        assertEq(before, risk.maxSafeStake(treasury.availableBankrollUnits(), 35, 0, 2500));
        fundHouse(100 ether);
        assertGt(game.maxStakeFor(35), before, "limits expand automatically as the treasury grows");
    }

    function test_tables_operatorOnlyAndValidated() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        game.createTable(1, 10, false);

        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.InvalidTable.selector, uint128(0), uint128(10)));
        game.createTable(0, 10, false);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.InvalidTable.selector, uint128(11), uint128(10)));
        game.createTable(11, 10, false);
        uint32 priv = game.createTable(5, 50, true);
        (uint128 minS, uint128 maxS, bool isPrivate, bool active) = game.tables(priv);
        assertEq(minS, 5);
        assertEq(maxS, 50);
        assertTrue(isPrivate);
        assertTrue(active);
        game.setTable(priv, 5, 50, true, false);
        vm.stopPrank();

        commitRound(1, SEED);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RouletteGame.TableNotActive.selector, priv));
        game.openRound(1, priv);
    }

    function test_playerSeedFoldsEveryBet() public {
        openRound(1, SEED);
        bytes32 before = game.getRound(1).playerSeed;
        placeAs(alice, 1, one(bet(risk.MASK_RED(), 1, 10)));
        bytes32 after1 = game.getRound(1).playerSeed;
        assertTrue(before != after1);
        assertEq(after1, keccak256(abi.encodePacked(before, alice, risk.MASK_RED(), uint16(1), uint128(10))));
    }

    function test_adminConfigBounds() public {
        vm.expectRevert(RouletteGame.InvalidConfig.selector);
        game.setMaxBetsPerRound(0);
        vm.expectRevert(RouletteGame.InvalidConfig.selector);
        game.setMaxBetsPerRound(1001);
        vm.expectRevert(RouletteGame.InvalidConfig.selector);
        game.setRoundTimeout(1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, stranger));
        game.setMaxBetsPerRound(10);
    }
}
