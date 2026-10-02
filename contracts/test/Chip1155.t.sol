// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {Chip1155} from "../src/Chip1155.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";

contract Chip1155Test is Fixture {
    address internal minter = address(0x1234);

    function setUp() public {
        deployStack();
        // Give a plain EOA the minter role so mint/burn can be exercised directly.
        acl.grantRole(Roles.MINTER_ROLE, minter);
    }

    function test_valueOf_knownDenominations() public view {
        assertEq(chip.valueOf(1001), 1);
        assertEq(chip.valueOf(1005), 5);
        assertEq(chip.valueOf(1010), 10);
        assertEq(chip.valueOf(1025), 25);
        assertEq(chip.valueOf(1050), 50);
        assertEq(chip.valueOf(1100), 100);
    }

    function test_valueOf_rejectsUnknownIds() public {
        vm.expectRevert(abi.encodeWithSelector(Chip1155.InvalidChipId.selector, 1002));
        chip.valueOf(1002);
        vm.expectRevert(abi.encodeWithSelector(Chip1155.InvalidChipId.selector, 0));
        chip.valueOf(0);
        vm.expectRevert(abi.encodeWithSelector(Chip1155.InvalidChipId.selector, 1000));
        chip.valueOf(1000);
    }

    function test_totalValue_sumsDenominations() public view {
        uint256[] memory ids = new uint256[](3);
        uint256[] memory amts = new uint256[](3);
        ids[0] = 1100;
        amts[0] = 2;
        ids[1] = 1025;
        amts[1] = 1;
        ids[2] = 1001;
        amts[2] = 7;
        assertEq(chip.totalValue(ids, amts), 232);
    }

    function test_totalValue_lengthMismatchReverts() public {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amts = new uint256[](1);
        vm.expectRevert(Chip1155.LengthMismatch.selector);
        chip.totalValue(ids, amts);
    }

    function test_mintValue_greedyDecomposition() public {
        vm.prank(minter);
        (uint256[] memory ids, uint256[] memory amts) = chip.mintValue(alice, 187);
        assertEq(ids.length, 5);
        assertEq(ids[0], 1100);
        assertEq(amts[0], 1);
        assertEq(ids[1], 1050);
        assertEq(amts[1], 1);
        assertEq(ids[2], 1025);
        assertEq(amts[2], 1);
        assertEq(ids[3], 1010);
        assertEq(amts[3], 1);
        assertEq(ids[4], 1001);
        assertEq(amts[4], 2);
        assertEq(chipUnitsOf(alice), 187);
        assertEq(chip.totalUnits(), 187);
    }

    function test_mintValue_zeroReverts() public {
        vm.prank(minter);
        vm.expectRevert(Chip1155.ZeroUnits.selector);
        chip.mintValue(alice, 0);
    }

    function test_mint_requiresMinterRole() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.MINTER_ROLE, stranger));
        chip.mintValue(alice, 10);
    }

    function test_batchMint_rejectsInvalidId() public {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory amts = new uint256[](1);
        ids[0] = 1002;
        amts[0] = 1;
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Chip1155.InvalidChipId.selector, 1002));
        chip.batchMint(alice, ids, amts);
    }

    function test_batchBurn_requiresApproval() public {
        vm.prank(minter);
        chip.mintValue(alice, 100);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(alice);

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Chip1155.NotOwnerNorApproved.selector, alice, minter));
        chip.batchBurn(alice, ids, amts);

        vm.prank(alice);
        chip.setApprovalForAll(minter, true);
        vm.prank(minter);
        uint256 burned = chip.batchBurn(alice, ids, amts);
        assertEq(burned, 100);
        assertEq(chip.totalUnits(), 0);
        assertEq(chipUnitsOf(alice), 0);
    }

    function test_batchBurn_requiresMinterRole() public {
        vm.prank(minter);
        chip.mintValue(alice, 5);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.MINTER_ROLE, alice));
        chip.batchBurn(alice, ids, amts);
    }

    function test_supplyTracking_acrossMintAndBurn() public {
        vm.startPrank(minter);
        chip.mintValue(alice, 155);
        chip.mintValue(bob, 45);
        vm.stopPrank();
        assertEq(chip.totalUnits(), 200);
        assertEq(chip.totalSupply(1100), 1);
        assertEq(chip.totalSupply(1050), 1);
        assertEq(chip.totalSupply(1010), 2); // 45 = 25 + 10 + 10 (greedy)
        assertEq(chip.totalSupply(1005), 1);

        vm.prank(bob);
        chip.setApprovalForAll(minter, true);
        (uint256[] memory ids, uint256[] memory amts) = heldChips(bob);
        vm.prank(minter);
        chip.batchBurn(bob, ids, amts);
        assertEq(chip.totalUnits(), 155);
    }

    function test_uri_perIdOverride() public {
        assertEq(keccak256(bytes(chip.uri(1001))), keccak256(bytes("ipfs://chips/{id}.json")));
        chip.setTokenURI(1001, "ipfs://one.json");
        assertEq(keccak256(bytes(chip.uri(1001))), keccak256(bytes("ipfs://one.json")));
        assertEq(keccak256(bytes(chip.uri(1005))), keccak256(bytes("ipfs://chips/{id}.json")));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, stranger));
        chip.setTokenURI(1001, "x");
    }
}
