// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRiskEngine
/// @notice Pure roulette payout / liability / solvency math. Mirrors `src/lib/risk/engine.ts`
///         and `src/lib/roulette/settle.ts` of the web app so UI, tests and contracts agree.
/// @dev All amounts are in chip units (not wei). The treasury converts wei <-> units at `chipPriceWei`.
interface IRiskEngine {
    /// @notice A wager: a set of covered pockets (bit i of `numbersMask` = pocket i, 0..36),
    ///         the profit multiplier (35 for straight-up) and the stake in chip units.
    ///         Total return on a win = stake * (multiplier + 1).
    struct Bet {
        uint64 numbersMask;
        uint16 multiplier;
        uint128 stake;
    }

    error NoBets();
    error InvalidBet(uint256 index);
    error ZeroMultiplier();
    /// @notice maximumLiabilityAfterBet > availableBankroll * maxRoundExposureBps / 10_000
    error ExposureCapExceeded(uint256 maxNetPayout, uint256 maxRoundExposure);

    /// @notice stake * (multiplier + 1)
    function payout(uint128 stake, uint16 multiplier) external pure returns (uint256);

    /// @notice Geometry + multiplier check for one bet (does not revert).
    function isValidBet(Bet calldata bet) external pure returns (bool);

    /// @notice Reverts with `InvalidBet(i)` for the first invalid bet.
    function validateBets(Bet[] calldata bets) external pure;

    /// @notice Worst case over all 37 outcomes.
    /// @return worstResult Pocket producing the largest total return.
    /// @return maxReturn Largest total return (stakes + profit) across outcomes.
    /// @return maxNetPayout max(0, maxReturn - totalStaked): what the treasury must reserve.
    function maximumLiability(Bet[] calldata bets)
        external
        pure
        returns (uint8 worstResult, uint256 maxReturn, uint256 maxNetPayout);

    /// @notice Largest stake S with S * multiplier <= available * exposureBps / 10_000 - existingLiability.
    function maxSafeStake(uint256 available, uint16 multiplier, uint256 existingLiability, uint16 exposureBps)
        external
        pure
        returns (uint256);

    /// @notice Pre-acceptance invariant. Validates every bet, then requires
    ///         maximumLiability(bets) <= available * exposureBps / 10_000, else reverts.
    function checkWager(uint256 available, uint16 exposureBps, Bet[] calldata bets)
        external
        pure
        returns (uint256 maxNetPayout, uint256 maxRoundExposure);
}
