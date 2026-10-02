// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";
import {IRandomnessSource} from "./interfaces/IRandomnessSource.sol";

/// @title RandomnessManager
/// @notice Commit-reveal randomness with future-block entropy. Mirrors `src/lib/fairness/commit-reveal.ts`:
///
///         result = uint256(keccak256(abi.encodePacked(serverSeed, playerSeed, blockRef, roundId))) % 37
///
///         1. OPERATOR `commit(roundId, keccak256(serverSeed))` BEFORE the game opens the round.
///         2. Players bet; the game folds every bet into `playerSeed`.
///         3. GAME `lock(roundId, playerSeed)` when bets close; `revealAfterBlock = block.number + delay`.
///         4. OPERATOR `reveal(roundId, serverSeed)` once `block.number > revealAfterBlock`;
///            `blockRef = blockhash(revealAfterBlock)`. If the hash is no longer available (older than
///            256 blocks) the round is VOID and the game refunds every stake.
///
/// @dev Threat model. The operator cannot choose the result (seed is committed before any bet, the
///      block hash is produced after bets close, and players contribute entropy). Players cannot
///      choose the result (they never learn the server seed before close). What the operator CAN do
///      is refuse to reveal and let the round void (a grief / selective-abort vector, visible onchain
///      via `RoundVoided`). A VRF adapter implementing {IRandomnessSource} removes that vector; the
///      game only depends on the interface. Note also that on Arbitrum-style chains `blockhash` is a
///      sequencer-influenced value, see README "Randomness".
contract RandomnessManager is RoleGated, IRandomnessSource {
    uint256 public constant POCKETS = 37;
    uint256 public constant BLOCKHASH_WINDOW = 256;
    uint64 public constant MIN_REVEAL_DELAY = 1;
    uint64 public constant MAX_REVEAL_DELAY = 200;

    struct Round {
        bytes32 commitment;
        bytes32 playerSeed;
        bytes32 serverSeed;
        bytes32 blockRef;
        uint64 revealAfterBlock;
        uint64 committedAtBlock;
        uint8 result;
        RoundStatus status;
    }

    /// @notice Blocks to wait after lock before the entropy block is taken.
    uint64 public revealDelayBlocks;

    mapping(uint256 roundId => Round) private _rounds;

    event Committed(uint256 indexed roundId, bytes32 commitment, address indexed operator);
    event Locked(uint256 indexed roundId, bytes32 playerSeed, uint64 revealAfterBlock);
    event Revealed(uint256 indexed roundId, bytes32 serverSeed, bytes32 blockRef, uint8 result);
    event Voided(uint256 indexed roundId, uint64 revealAfterBlock, uint256 atBlock);
    event RevealDelayUpdated(uint64 previous, uint64 current);

    error InvalidStatus(uint256 roundId, RoundStatus actual, RoundStatus expected);
    error ZeroCommitment();
    error RevealTooEarly(uint256 roundId, uint64 revealAfterBlock, uint256 currentBlock);
    error CommitmentMismatch(uint256 roundId);
    error WindowNotExpired(uint256 roundId, uint64 revealAfterBlock, uint256 currentBlock);
    error InvalidRevealDelay(uint64 delay);

    constructor(address acl_, uint64 revealDelayBlocks_) RoleGated(acl_) {
        _setRevealDelay(revealDelayBlocks_);
    }

    // -------------------------------------------------------------- operator

    /// @notice Commit `keccak256(abi.encodePacked(serverSeed))` for a fresh `roundId`.
    /// @dev roundId uniqueness is the replay protection: a round can be committed exactly once, ever.
    function commit(uint256 roundId, bytes32 commitment) external onlyRole(Roles.OPERATOR_ROLE) {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.None) revert InvalidStatus(roundId, r.status, RoundStatus.None);
        if (commitment == bytes32(0)) revert ZeroCommitment();
        r.commitment = commitment;
        r.committedAtBlock = uint64(block.number);
        r.status = RoundStatus.Committed;
        emit Committed(roundId, commitment, msg.sender);
    }

    /// @notice Reveal the server seed and fix the result. Voids the round instead if the entropy
    ///         block hash is no longer retrievable.
    function reveal(uint256 roundId, bytes32 serverSeed) external onlyRole(Roles.OPERATOR_ROLE) {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Locked) revert InvalidStatus(roundId, r.status, RoundStatus.Locked);
        if (block.number <= r.revealAfterBlock) revert RevealTooEarly(roundId, r.revealAfterBlock, block.number);
        if (keccak256(abi.encodePacked(serverSeed)) != r.commitment) revert CommitmentMismatch(roundId);

        bytes32 blockRef = blockhash(r.revealAfterBlock);
        if (blockRef == bytes32(0)) {
            _void(r, roundId);
            return;
        }
        uint8 res = deriveResult(serverSeed, r.playerSeed, blockRef, roundId);
        r.serverSeed = serverSeed;
        r.blockRef = blockRef;
        r.result = res;
        r.status = RoundStatus.Revealed;
        emit Revealed(roundId, serverSeed, blockRef, res);
    }

    // ------------------------------------------------------------------ game

    /// @inheritdoc IRandomnessSource
    function lock(uint256 roundId, bytes32 playerSeed) external onlyRole(Roles.GAME_ROLE) {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Committed) revert InvalidStatus(roundId, r.status, RoundStatus.Committed);
        uint64 target = uint64(block.number) + revealDelayBlocks;
        r.playerSeed = playerSeed;
        r.revealAfterBlock = target;
        r.status = RoundStatus.Locked;
        emit Locked(roundId, playerSeed, target);
    }

    // ---------------------------------------------------------------- anyone

    /// @inheritdoc IRandomnessSource
    function markVoid(uint256 roundId) external {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Locked) revert InvalidStatus(roundId, r.status, RoundStatus.Locked);
        if (block.number <= uint256(r.revealAfterBlock) + BLOCKHASH_WINDOW) {
            revert WindowNotExpired(roundId, r.revealAfterBlock, block.number);
        }
        _void(r, roundId);
    }

    // ----------------------------------------------------------------- views

    /// @inheritdoc IRandomnessSource
    function status(uint256 roundId) external view returns (RoundStatus) {
        return _rounds[roundId].status;
    }

    /// @inheritdoc IRandomnessSource
    function isCommitted(uint256 roundId) external view returns (bool) {
        return _rounds[roundId].status == RoundStatus.Committed;
    }

    /// @inheritdoc IRandomnessSource
    function result(uint256 roundId) external view returns (uint8) {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Revealed) revert InvalidStatus(roundId, r.status, RoundStatus.Revealed);
        return r.result;
    }

    /// @inheritdoc IRandomnessSource
    function revealAfterBlock(uint256 roundId) external view returns (uint256) {
        return _rounds[roundId].revealAfterBlock;
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    /// @notice Recomputes commitment and result from stored data; true iff the stored result is honest.
    function verify(uint256 roundId) external view returns (bool) {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Revealed) return false;
        if (keccak256(abi.encodePacked(r.serverSeed)) != r.commitment) return false;
        return deriveResult(r.serverSeed, r.playerSeed, r.blockRef, roundId) == r.result;
    }

    /// @notice Pure result derivation, identical to `deriveResult` in commit-reveal.ts.
    function deriveResult(bytes32 serverSeed, bytes32 playerSeed, bytes32 blockRef, uint256 roundId)
        public
        pure
        returns (uint8)
    {
        return uint8(uint256(keccak256(abi.encodePacked(serverSeed, playerSeed, blockRef, roundId))) % POCKETS);
    }

    // ----------------------------------------------------------------- admin

    function setRevealDelay(uint64 delay) external onlyRole(Roles.ADMIN_ROLE) {
        _setRevealDelay(delay);
    }

    // -------------------------------------------------------------- internal

    function _setRevealDelay(uint64 delay) internal {
        if (delay < MIN_REVEAL_DELAY || delay > MAX_REVEAL_DELAY) revert InvalidRevealDelay(delay);
        emit RevealDelayUpdated(revealDelayBlocks, delay);
        revealDelayBlocks = delay;
    }

    function _void(Round storage r, uint256 roundId) internal {
        r.status = RoundStatus.Void;
        emit Voided(roundId, r.revealAfterBlock, block.number);
    }
}
