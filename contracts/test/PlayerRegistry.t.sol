// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {PlayerRegistry} from "../src/PlayerRegistry.sol";

contract PlayerRegistryTest is BaseTest {
    PlayerRegistry internal registry;
    address internal alice = address(0x1111);
    address internal bob = address(0x2222);
    bytes32 internal constant CODE = keccak256("ALICE-REF");

    function setUp() public {
        registry = new PlayerRegistry();
    }

    function test_displayNameHash() public {
        vm.prank(alice);
        registry.setDisplayNameHash(keccak256("alice"));
        assertEq(registry.displayNameHash(alice), keccak256("alice"));
    }

    function test_registerCode_onceAndUnique() public {
        vm.prank(alice);
        registry.registerReferralCode(CODE);
        assertEq(registry.codeOwner(CODE), alice);
        assertEq(registry.codeOf(alice), CODE);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PlayerRegistry.CodeTaken.selector, CODE));
        registry.registerReferralCode(CODE);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PlayerRegistry.AlreadyHasCode.selector, alice));
        registry.registerReferralCode(keccak256("second"));

        vm.prank(bob);
        vm.expectRevert(PlayerRegistry.ZeroCode.selector);
        registry.registerReferralCode(bytes32(0));
    }

    function test_setReferrer_preventsSelfAndRepeat() public {
        vm.prank(alice);
        registry.registerReferralCode(CODE);

        vm.prank(alice);
        vm.expectRevert(PlayerRegistry.SelfReferral.selector);
        registry.setReferrer(CODE);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PlayerRegistry.UnknownCode.selector, keccak256("nope")));
        registry.setReferrer(keccak256("nope"));

        vm.prank(bob);
        registry.setReferrer(CODE);
        assertEq(registry.referrerOf(bob), alice);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PlayerRegistry.ReferrerAlreadySet.selector, bob));
        registry.setReferrer(CODE);
    }
}
