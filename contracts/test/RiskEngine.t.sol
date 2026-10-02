// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {RiskEngine} from "../src/RiskEngine.sol";
import {IRiskEngine} from "../src/interfaces/IRiskEngine.sol";

contract RiskEngineTest is Fixture {
    function setUp() public {
        risk = new RiskEngine();
    }

    // ------------------------------------------------------------ payout math

    function test_payout_isStakeTimesMultiplierPlusOne() public view {
        assertEq(risk.payout(10, 35), 360);
        assertEq(risk.payout(5, 1), 10);
        assertEq(risk.payout(7, 2), 21);
        assertEq(risk.payout(type(uint128).max, 35), uint256(type(uint128).max) * 36);
    }

    function test_maximumLiability_singleStraight() public view {
        (uint8 worst, uint256 maxReturn, uint256 maxNet) = risk.maximumLiability(one(bet(straightMask(17), 35, 10)));
        assertEq(worst, 17);
        assertEq(maxReturn, 360);
        assertEq(maxNet, 350);
    }

    function test_maximumLiability_hedgedBetsNetToZero() public view {
        (, uint256 maxReturn, uint256 maxNet) =
            risk.maximumLiability(two(bet(risk.MASK_RED(), 1, 10), bet(risk.MASK_BLACK(), 1, 10)));
        assertEq(maxReturn, 20);
        assertEq(maxNet, 0, "net liability of a perfect hedge is zero");
    }

    function test_maximumLiability_worstOutcomeStacksOverlappingBets() public view {
        // 19 is red: straight on 19 + red both pay when 19 hits.
        (uint8 worst, uint256 maxReturn, uint256 maxNet) =
            risk.maximumLiability(two(bet(straightMask(19), 35, 10), bet(risk.MASK_RED(), 1, 10)));
        assertEq(worst, 19);
        assertEq(maxReturn, 360 + 20);
        assertEq(maxNet, 380 - 20);
    }

    function test_maximumLiability_emptySetIsZero() public view {
        IRiskEngine.Bet[] memory none = new IRiskEngine.Bet[](0);
        (, uint256 maxReturn, uint256 maxNet) = risk.maximumLiability(none);
        assertEq(maxReturn, 0);
        assertEq(maxNet, 0);
    }

    // -------------------------------------------------------------- validation

    function test_isValidBet_acceptsStandardTable() public view {
        assertTrue(risk.isValidBet(bet(straightMask(0), 35, 1)), "straight 0");
        assertTrue(risk.isValidBet(bet(straightMask(36), 35, 1)), "straight 36");
        assertTrue(risk.isValidBet(bet(maskOf(_n2(1, 2)), 17, 1)), "split 1-2");
        assertTrue(risk.isValidBet(bet(maskOf(_n2(1, 4)), 17, 1)), "split 1-4");
        assertTrue(risk.isValidBet(bet(maskOf(_n2(0, 3)), 17, 1)), "split 0-3");
        assertTrue(risk.isValidBet(bet(maskOf(_n3(4, 5, 6)), 11, 1)), "street 4-6");
        assertTrue(risk.isValidBet(bet(maskOf(_n4(1, 2, 4, 5)), 8, 1)), "corner 1");
        assertTrue(risk.isValidBet(bet(maskOf(_n4(32, 33, 35, 36)), 8, 1)), "corner 32");
        assertTrue(risk.isValidBet(bet(maskOf(_n6(31, 32, 33, 34, 35, 36)), 5, 1)), "sixline 31");
        assertTrue(risk.isValidBet(bet(risk.MASK_DOZEN_2(), 2, 1)), "dozen 2");
        assertTrue(risk.isValidBet(bet(risk.MASK_COLUMN_3(), 2, 1)), "column 3");
        assertTrue(risk.isValidBet(bet(risk.MASK_RED(), 1, 1)), "red");
        assertTrue(risk.isValidBet(bet(risk.MASK_BLACK(), 1, 1)), "black");
        assertTrue(risk.isValidBet(bet(risk.MASK_ODD(), 1, 1)), "odd");
        assertTrue(risk.isValidBet(bet(risk.MASK_EVEN(), 1, 1)), "even");
        assertTrue(risk.isValidBet(bet(risk.MASK_LOW(), 1, 1)), "low");
        assertTrue(risk.isValidBet(bet(risk.MASK_HIGH(), 1, 1)), "high");
    }

    function test_isValidBet_rejectsBadMasks() public view {
        assertFalse(risk.isValidBet(bet(0, 35, 1)), "empty mask");
        assertFalse(risk.isValidBet(bet(uint64(1) << 37, 35, 1)), "pocket 37 does not exist");
        assertFalse(risk.isValidBet(bet(maskOf(_n2(1, 3)), 17, 1)), "split 1-3 not adjacent");
        assertFalse(risk.isValidBet(bet(maskOf(_n2(3, 4)), 17, 1)), "split 3-4 wraps rows");
        assertFalse(risk.isValidBet(bet(maskOf(_n2(0, 4)), 17, 1)), "split 0-4");
        assertFalse(risk.isValidBet(bet(maskOf(_n3(2, 3, 4)), 11, 1)), "street must start in column 1");
        assertFalse(risk.isValidBet(bet(maskOf(_n4(3, 4, 6, 7)), 8, 1)), "corner cannot start in column 3");
        assertFalse(risk.isValidBet(bet(maskOf(_n4(1, 3, 4, 5)), 8, 1)), "corner must be a 2x2 block");
        assertFalse(risk.isValidBet(bet(maskOf(_n6(2, 3, 4, 5, 6, 7)), 5, 1)), "sixline must start in column 1");
        assertFalse(risk.isValidBet(bet(risk.MASK_DOZEN_1() ^ 2 ^ (uint64(1) << 13), 2, 1)), "arbitrary 12 numbers");
        assertFalse(risk.isValidBet(bet(risk.MASK_RED() ^ 2 ^ 4, 1, 1)), "arbitrary 18 numbers");
        assertFalse(risk.isValidBet(bet(maskOf(_n5(1, 2, 3, 4, 5)), 5, 1)), "5 numbers is not a bet kind");
        assertFalse(risk.isValidBet(bet(straightMask(5), 35, 0)), "zero stake");
    }

    function test_isValidBet_rejectsWrongMultipliers() public view {
        assertFalse(risk.isValidBet(bet(straightMask(5), 36, 1)), "straight must pay 35");
        assertFalse(risk.isValidBet(bet(straightMask(5), 1, 1)), "straight at even money");
        assertFalse(risk.isValidBet(bet(maskOf(_n2(1, 2)), 35, 1)), "split must pay 17");
        assertFalse(risk.isValidBet(bet(maskOf(_n3(1, 2, 3)), 12, 1)), "street must pay 11");
        assertFalse(risk.isValidBet(bet(maskOf(_n4(1, 2, 4, 5)), 9, 1)), "corner must pay 8");
        assertFalse(risk.isValidBet(bet(maskOf(_n6(1, 2, 3, 4, 5, 6)), 6, 1)), "sixline must pay 5");
        assertFalse(risk.isValidBet(bet(risk.MASK_DOZEN_1(), 3, 1)), "dozen must pay 2");
        assertFalse(risk.isValidBet(bet(risk.MASK_RED(), 2, 1)), "red must pay 1");
    }

    function test_validateBets_revertsWithIndex() public {
        IRiskEngine.Bet[] memory bets = two(bet(straightMask(1), 35, 1), bet(straightMask(1), 34, 1));
        vm.expectRevert(abi.encodeWithSelector(IRiskEngine.InvalidBet.selector, 1));
        risk.validateBets(bets);
    }

    // ------------------------------------------------------------- max safe

    function test_maxSafeStake_matchesFormula() public view {
        // available 85_000, cap 25% = 21_250
        assertEq(risk.maxSafeStake(85_000, 35, 0, 2500), 607);
        assertEq(risk.maxSafeStake(85_000, 1, 0, 2500), 21_250);
        assertEq(risk.maxSafeStake(85_000, 35, 21_000, 2500), 7);
        assertEq(risk.maxSafeStake(85_000, 35, 30_000, 2500), 0, "existing liability beyond cap");
        assertEq(risk.maxSafeStake(0, 35, 0, 2500), 0);
    }

    function test_maxSafeStake_zeroMultiplierReverts() public {
        vm.expectRevert(IRiskEngine.ZeroMultiplier.selector);
        risk.maxSafeStake(1, 0, 0, 2500);
    }

    // ------------------------------------------------------------ checkWager

    function test_checkWager_passesWithinCap() public view {
        (uint256 maxNet, uint256 cap) = risk.checkWager(85_000, 2500, one(bet(straightMask(7), 35, 600)));
        assertEq(maxNet, 21_000);
        assertEq(cap, 21_250);
    }

    function test_checkWager_revertsNoBets() public {
        IRiskEngine.Bet[] memory none = new IRiskEngine.Bet[](0);
        vm.expectRevert(IRiskEngine.NoBets.selector);
        risk.checkWager(85_000, 2500, none);
    }

    function test_checkWager_revertsInvalidBet() public {
        vm.expectRevert(abi.encodeWithSelector(IRiskEngine.InvalidBet.selector, 0));
        risk.checkWager(85_000, 2500, one(bet(straightMask(7), 36, 1)));
    }

    function test_checkWager_revertsWhenOverExposed() public {
        vm.expectRevert(abi.encodeWithSelector(IRiskEngine.ExposureCapExceeded.selector, 21_350, 21_250));
        risk.checkWager(85_000, 2500, one(bet(straightMask(7), 35, 610)));
    }

    // ----------------------------------------------------------------- utils

    function _n2(uint8 a, uint8 b) internal pure returns (uint8[] memory n) {
        n = new uint8[](2);
        n[0] = a;
        n[1] = b;
    }

    function _n3(uint8 a, uint8 b, uint8 c) internal pure returns (uint8[] memory n) {
        n = new uint8[](3);
        n[0] = a;
        n[1] = b;
        n[2] = c;
    }

    function _n4(uint8 a, uint8 b, uint8 c, uint8 d) internal pure returns (uint8[] memory n) {
        n = new uint8[](4);
        n[0] = a;
        n[1] = b;
        n[2] = c;
        n[3] = d;
    }

    function _n5(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[] memory n) {
        n = new uint8[](5);
        n[0] = a;
        n[1] = b;
        n[2] = c;
        n[3] = d;
        n[4] = e;
    }

    function _n6(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e, uint8 f) internal pure returns (uint8[] memory n) {
        n = new uint8[](6);
        n[0] = a;
        n[1] = b;
        n[2] = c;
        n[3] = d;
        n[4] = e;
        n[5] = f;
    }
}
