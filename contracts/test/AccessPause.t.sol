// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {EmergencyPause} from "../src/EmergencyPause.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";

contract AccessPauseTest is Fixture {
    function setUp() public {
        deployStack();
    }

    // ---------------------------------------------------------------- roles

    function test_rolesWiredByFixture() public view {
        assertTrue(acl.hasRole(Roles.ADMIN_ROLE, admin));
        assertTrue(acl.hasRole(Roles.OPERATOR_ROLE, operator));
        assertTrue(acl.hasRole(Roles.PAUSER_ROLE, pauser));
        assertTrue(acl.hasRole(Roles.TREASURER_ROLE, treasurer));
        assertTrue(acl.hasRole(Roles.GAME_ROLE, address(game)));
        assertTrue(acl.hasRole(Roles.MINTER_ROLE, address(treasury)));
        assertTrue(acl.hasRole(Roles.REWARD_CREDITOR_ROLE, address(treasury)));
        assertFalse(acl.hasRole(Roles.OPERATOR_ROLE, stranger));
    }

    function test_onlyAdminGrantsRoles() public {
        vm.prank(stranger);
        vm.expectRevert();
        acl.grantRole(Roles.OPERATOR_ROLE, stranger);
        vm.prank(operator);
        vm.expectRevert();
        acl.grantRole(Roles.OPERATOR_ROLE, stranger);
    }

    function test_adminRoleCannotBeGrantedDirectly() public {
        // AccessControlDefaultAdminRules forbids grantRole(DEFAULT_ADMIN_ROLE): transfer is two-step only.
        vm.expectRevert();
        acl.grantRole(Roles.ADMIN_ROLE, stranger);
    }

    function test_twoStepAdminTransfer() public {
        address multisig = address(0x5AFE);
        acl.beginDefaultAdminTransfer(multisig);
        assertTrue(acl.hasRole(Roles.ADMIN_ROLE, admin), "still admin until accepted");

        vm.prank(stranger);
        vm.expectRevert();
        acl.acceptDefaultAdminTransfer();

        vm.warp(block.timestamp + 1);
        vm.prank(multisig);
        acl.acceptDefaultAdminTransfer();
        assertTrue(acl.hasRole(Roles.ADMIN_ROLE, multisig));
        assertFalse(acl.hasRole(Roles.ADMIN_ROLE, admin));
        assertEq(acl.defaultAdmin(), multisig);
    }

    function test_roleGatedContractsReadTheSharedRegistry() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        game.createTable(1, 2, false);
        acl.grantRole(Roles.OPERATOR_ROLE, stranger);
        vm.prank(stranger);
        game.createTable(1, 2, false);
        acl.revokeRole(Roles.OPERATOR_ROLE, stranger);
        vm.prank(stranger);
        vm.expectRevert();
        game.createTable(1, 2, false);
    }

    // ---------------------------------------------------------------- pause

    function test_pauserRaisesAdminLowers() public {
        vm.prank(pauser);
        treasury.pause(treasury.PAUSE_DEPOSITS() | treasury.PAUSE_WITHDRAWALS());
        assertTrue(treasury.isPaused(treasury.PAUSE_DEPOSITS()));
        assertTrue(treasury.isPaused(treasury.PAUSE_WITHDRAWALS()));
        assertFalse(treasury.isPaused(treasury.PAUSE_GAMEPLAY()));

        vm.prank(pauser);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, pauser));
        treasury.unpause(treasury.PAUSE_DEPOSITS());

        treasury.unpause(treasury.PAUSE_DEPOSITS());
        assertFalse(treasury.isPaused(treasury.PAUSE_DEPOSITS()));
        assertTrue(treasury.isPaused(treasury.PAUSE_WITHDRAWALS()));
        assertEq(treasury.pauseFlags(), 8);
    }

    function test_strangerCannotPause() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.PAUSER_ROLE, stranger));
        game.pause(game.PAUSE_GAMEPLAY());
    }

    function test_invalidFlagsRejected() public {
        vm.startPrank(pauser);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.InvalidPauseFlags.selector, uint8(0)));
        vault.pause(0);
        vm.expectRevert(abi.encodeWithSelector(EmergencyPause.InvalidPauseFlags.selector, uint8(0x10)));
        vault.pause(0x10);
        vm.stopPrank();
    }

    function test_pauseAllThenDrillUnpause() public {
        vm.prank(pauser);
        vault.pause(vault.PAUSE_ALL());
        assertEq(vault.pauseFlags(), 0x0f);
        vault.unpause(vault.PAUSE_ALL());
        assertEq(vault.pauseFlags(), 0);
    }

    function test_flagsAreIndependentPerContract() public {
        vm.prank(pauser);
        treasury.pause(treasury.PAUSE_ALL());
        assertEq(game.pauseFlags(), 0);
        assertEq(vault.pauseFlags(), 0);
    }
}
