// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "./utils/Fixture.sol";
import {RandomnessManager} from "../src/RandomnessManager.sol";
import {IRandomnessSource} from "../src/interfaces/IRandomnessSource.sol";
import {RoleGated} from "../src/RoleGated.sol";
import {Roles} from "../src/Roles.sol";

contract RandomnessManagerTest is Fixture {
    bytes32 internal constant SEED = keccak256("server-seed-1");
    bytes32 internal constant PLAYER_SEED = keccak256("player-seed");

    function setUp() public {
        deployStack();
        // Let the test act as the game for direct lock() calls.
        acl.grantRole(Roles.GAME_ROLE, address(this));
    }

    function test_commit_requiresOperator() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.OPERATOR_ROLE, stranger));
        randomness.commit(1, commitment(SEED));
    }

    function test_commit_rejectsZeroAndReplay() public {
        vm.startPrank(operator);
        vm.expectRevert(RandomnessManager.ZeroCommitment.selector);
        randomness.commit(1, bytes32(0));
        randomness.commit(1, commitment(SEED));
        vm.expectRevert(
            abi.encodeWithSelector(
                RandomnessManager.InvalidStatus.selector,
                1,
                IRandomnessSource.RoundStatus.Committed,
                IRandomnessSource.RoundStatus.None
            )
        );
        randomness.commit(1, commitment(SEED)); // same roundId can never be reused
        vm.stopPrank();
        assertTrue(randomness.isCommitted(1));
    }

    function test_lock_requiresGameRoleAndCommitment() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.GAME_ROLE, stranger));
        randomness.lock(1, PLAYER_SEED);

        vm.expectRevert(
            abi.encodeWithSelector(
                RandomnessManager.InvalidStatus.selector,
                1,
                IRandomnessSource.RoundStatus.None,
                IRandomnessSource.RoundStatus.Committed
            )
        );
        randomness.lock(1, PLAYER_SEED);
    }

    function test_lock_schedulesFutureBlock() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        assertEq(randomness.revealAfterBlock(1), block.number + REVEAL_DELAY);
        assertTrue(randomness.status(1) == IRandomnessSource.RoundStatus.Locked);
    }

    function test_reveal_tooEarlyReverts() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        uint64 target = uint64(randomness.revealAfterBlock(1));
        vm.roll(target); // must be strictly after
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RandomnessManager.RevealTooEarly.selector, 1, target, target));
        randomness.reveal(1, SEED);
    }

    function test_reveal_mismatchReverts() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        vm.roll(randomness.revealAfterBlock(1) + 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RandomnessManager.CommitmentMismatch.selector, 1));
        randomness.reveal(1, keccak256("wrong"));
    }

    function test_reveal_beforeLockReverts() public {
        commitRound(1, SEED);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                RandomnessManager.InvalidStatus.selector,
                1,
                IRandomnessSource.RoundStatus.Committed,
                IRandomnessSource.RoundStatus.Locked
            )
        );
        randomness.reveal(1, SEED);
    }

    function test_reveal_derivesResultExactlyLikeCommitRevealTs() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        uint256 target = randomness.revealAfterBlock(1);
        vm.roll(target + 1);
        bytes32 blockRef = blockhash(target);
        assertTrue(blockRef != bytes32(0));
        uint8 expected = uint8(uint256(keccak256(abi.encodePacked(SEED, PLAYER_SEED, blockRef, uint256(1)))) % 37);

        vm.prank(operator);
        randomness.reveal(1, SEED);

        assertEq(randomness.result(1), expected);
        assertTrue(randomness.verify(1));
        assertTrue(randomness.status(1) == IRandomnessSource.RoundStatus.Revealed);
        RandomnessManager.Round memory r = randomness.getRound(1);
        assertEq(r.serverSeed, SEED);
        assertEq(r.blockRef, blockRef);
    }

    function test_reveal_twiceReverts() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        vm.roll(randomness.revealAfterBlock(1) + 1);
        vm.startPrank(operator);
        randomness.reveal(1, SEED);
        vm.expectRevert();
        randomness.reveal(1, SEED);
        vm.stopPrank();
    }

    function test_reveal_afterWindowVoidsRound() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        vm.roll(randomness.revealAfterBlock(1) + 257);
        vm.prank(operator);
        randomness.reveal(1, SEED);
        assertTrue(randomness.status(1) == IRandomnessSource.RoundStatus.Void);
        vm.expectRevert();
        randomness.result(1);
    }

    function test_markVoid_onlyAfterWindow() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        uint256 target = randomness.revealAfterBlock(1);
        vm.roll(target + 256);
        vm.expectRevert(
            abi.encodeWithSelector(RandomnessManager.WindowNotExpired.selector, 1, uint64(target), target + 256)
        );
        randomness.markVoid(1);
        vm.roll(target + 257);
        vm.prank(stranger); // anyone
        randomness.markVoid(1);
        assertTrue(randomness.status(1) == IRandomnessSource.RoundStatus.Void);
    }

    function test_resultUnavailableBeforeReveal() public {
        commitRound(1, SEED);
        vm.expectRevert();
        randomness.result(1);
    }

    function test_setRevealDelay_boundsAndRole() public {
        vm.expectRevert(abi.encodeWithSelector(RandomnessManager.InvalidRevealDelay.selector, uint64(0)));
        randomness.setRevealDelay(0);
        vm.expectRevert(abi.encodeWithSelector(RandomnessManager.InvalidRevealDelay.selector, uint64(201)));
        randomness.setRevealDelay(201);
        randomness.setRevealDelay(5);
        assertEq(randomness.revealDelayBlocks(), 5);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RoleGated.Unauthorized.selector, Roles.ADMIN_ROLE, stranger));
        randomness.setRevealDelay(3);
    }

    function test_noAdminFunctionCanAlterARevealedResult() public {
        commitRound(1, SEED);
        randomness.lock(1, PLAYER_SEED);
        vm.roll(randomness.revealAfterBlock(1) + 1);
        vm.prank(operator);
        randomness.reveal(1, SEED);
        uint8 before = randomness.result(1);
        randomness.setRevealDelay(10); // the only admin setter
        assertEq(randomness.result(1), before);
        assertTrue(randomness.verify(1));
    }
}
