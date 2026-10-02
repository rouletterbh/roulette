// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRandomnessSource
/// @notice Abstraction the game uses to obtain a verifiable roulette result for a round.
/// @dev The first implementation is {RandomnessManager} (operator commit-reveal + future blockhash).
///      A VRF adapter implements the same surface: `isCommitted` -> "request accepted",
///      `lock` -> "entropy input frozen", `status` -> Revealed once the VRF callback lands.
interface IRandomnessSource {
    enum RoundStatus {
        None, // never seen
        Committed, // operator committed hash(serverSeed); bets may open
        Locked, // bets closed; playerSeed frozen; waiting for revealAfterBlock
        Revealed, // result available
        Void // entropy window missed; round must be refunded
    }

    function status(uint256 roundId) external view returns (RoundStatus);

    function isCommitted(uint256 roundId) external view returns (bool);

    /// @notice Freezes the player-side entropy and schedules the entropy block. GAME only.
    function lock(uint256 roundId, bytes32 playerSeed) external;

    /// @notice Marks a locked round void if the reveal window expired. Anyone may call.
    function markVoid(uint256 roundId) external;

    /// @notice Result in [0, 36]. Reverts unless status == Revealed.
    function result(uint256 roundId) external view returns (uint8);

    function revealAfterBlock(uint256 roundId) external view returns (uint256);
}
