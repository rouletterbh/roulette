// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRiskEngine} from "./interfaces/IRiskEngine.sol";

/// @title RiskEngine
/// @notice Stateless roulette math: payouts, bet geometry validation, worst-case liability over the
///         37 pockets and the solvency pre-check. Deployed once, referenced immutably by {RouletteGame}
///         (so governance cannot swap in a laxer engine), and callable offchain for UI quotes.
/// @dev Mirrors `src/lib/roulette/bets.ts` (PAYOUT table, isValidBet), `src/lib/roulette/settle.ts`
///      (settleBets, maximumLiability) and `src/lib/risk/engine.ts` (getMaximumSafeBet, checkWager).
///      Geometry is checked by exact mask equality, which is strictly tighter than the TS endpoint
///      checks (a bet the TS rejects is rejected here; a few malformed corners the TS would accept
///      are rejected here too).
contract RiskEngine is IRiskEngine {
    uint256 public constant POCKETS = 37;
    uint16 public constant BPS = 10_000;
    uint64 internal constant ALL_POCKETS = (uint64(1) << 37) - 1;

    // Standard European table, profit multipliers.
    uint16 public constant MULT_STRAIGHT = 35;
    uint16 public constant MULT_SPLIT = 17;
    uint16 public constant MULT_STREET = 11;
    uint16 public constant MULT_CORNER = 8;
    uint16 public constant MULT_SIXLINE = 5;
    uint16 public constant MULT_COLUMN = 2;
    uint16 public constant MULT_DOZEN = 2;
    uint16 public constant MULT_EVEN_MONEY = 1;

    // Outside-bet masks (bit i = pocket i).
    uint64 public constant MASK_RED = 0x000000154aad52aa;
    uint64 public constant MASK_BLACK = 0x0000000ab552ad54;
    uint64 public constant MASK_ODD = 0x0000000aaaaaaaaa;
    uint64 public constant MASK_EVEN = 0x0000001555555554;
    uint64 public constant MASK_LOW = 0x000000000007fffe; // 1..18
    uint64 public constant MASK_HIGH = 0x0000001ffff80000; // 19..36
    uint64 public constant MASK_DOZEN_1 = 0x0000000000001ffe;
    uint64 public constant MASK_DOZEN_2 = 0x0000000001ffe000;
    uint64 public constant MASK_DOZEN_3 = 0x0000001ffe000000;
    uint64 public constant MASK_COLUMN_1 = 0x0000000492492492;
    uint64 public constant MASK_COLUMN_2 = 0x0000000924924924;
    uint64 public constant MASK_COLUMN_3 = 0x0000001249249248;

    // --------------------------------------------------------------- payouts

    /// @inheritdoc IRiskEngine
    function payout(uint128 stake, uint16 multiplier) public pure returns (uint256) {
        return uint256(stake) * (uint256(multiplier) + 1);
    }

    /// @inheritdoc IRiskEngine
    function maximumLiability(Bet[] calldata bets)
        public
        pure
        returns (uint8 worstResult, uint256 maxReturn, uint256 maxNetPayout)
    {
        uint256 totalStaked;
        uint256 n = bets.length;
        for (uint256 i; i < n; ++i) totalStaked += bets[i].stake;

        for (uint256 pocket; pocket < POCKETS; ++pocket) {
            uint256 ret;
            for (uint256 i; i < n; ++i) {
                if ((bets[i].numbersMask >> pocket) & 1 == 1) {
                    ret += payout(bets[i].stake, bets[i].multiplier);
                }
            }
            if (ret > maxReturn) {
                maxReturn = ret;
                worstResult = uint8(pocket);
            }
        }
        maxNetPayout = maxReturn > totalStaked ? maxReturn - totalStaked : 0;
    }

    // -------------------------------------------------------------- solvency

    /// @inheritdoc IRiskEngine
    function maxSafeStake(uint256 available, uint16 multiplier, uint256 existingLiability, uint16 exposureBps)
        public
        pure
        returns (uint256)
    {
        if (multiplier == 0) revert ZeroMultiplier();
        uint256 maxRoundExposure = available * exposureBps / BPS;
        uint256 headroom = maxRoundExposure > existingLiability ? maxRoundExposure - existingLiability : 0;
        return headroom / multiplier;
    }

    /// @inheritdoc IRiskEngine
    function checkWager(uint256 available, uint16 exposureBps, Bet[] calldata bets)
        external
        pure
        returns (uint256 maxNetPayout, uint256 maxRoundExposure)
    {
        if (bets.length == 0) revert NoBets();
        validateBets(bets);
        (,, maxNetPayout) = maximumLiability(bets);
        maxRoundExposure = available * exposureBps / BPS;
        if (maxNetPayout > maxRoundExposure) revert ExposureCapExceeded(maxNetPayout, maxRoundExposure);
    }

    // ------------------------------------------------------------ validation

    /// @inheritdoc IRiskEngine
    function validateBets(Bet[] calldata bets) public pure {
        for (uint256 i; i < bets.length; ++i) {
            if (!isValidBet(bets[i])) revert InvalidBet(i);
        }
    }

    /// @inheritdoc IRiskEngine
    function isValidBet(Bet calldata bet) public pure returns (bool) {
        uint64 mask = bet.numbersMask;
        if (mask == 0 || mask & ~ALL_POCKETS != 0 || bet.stake == 0) return false;
        uint256 count = _popcount(mask);
        uint16 m = bet.multiplier;

        if (count == 1) return m == MULT_STRAIGHT;
        if (count == 2) return m == MULT_SPLIT && _isSplit(mask);
        if (count == 3) return m == MULT_STREET && _isStreet(mask);
        if (count == 4) return m == MULT_CORNER && _isCorner(mask);
        if (count == 6) return m == MULT_SIXLINE && _isSixLine(mask);
        if (count == 12) {
            return m == MULT_DOZEN
                && (
                    mask == MASK_DOZEN_1 || mask == MASK_DOZEN_2 || mask == MASK_DOZEN_3 || mask == MASK_COLUMN_1
                        || mask == MASK_COLUMN_2 || mask == MASK_COLUMN_3
                );
        }
        if (count == 18) {
            return m == MULT_EVEN_MONEY
                && (
                    mask == MASK_RED || mask == MASK_BLACK || mask == MASK_ODD || mask == MASK_EVEN || mask == MASK_LOW
                        || mask == MASK_HIGH
                );
        }
        return false;
    }

    /// @dev Split: adjacent horizontally (b = a+1, a not in column 3) or vertically (b = a+3);
    ///      zero splits with 1, 2 or 3.
    function _isSplit(uint64 mask) internal pure returns (bool) {
        uint256 a = _lowestBit(mask);
        uint256 b = _highestBit(mask);
        if (a == 0) return b >= 1 && b <= 3;
        return (b - a == 1 && a % 3 != 0) || b - a == 3;
    }

    /// @dev Street: {a, a+1, a+2} with a in column 1.
    function _isStreet(uint64 mask) internal pure returns (bool) {
        uint256 a = _lowestBit(mask);
        return a % 3 == 1 && mask == (uint64(0x7) << uint64(a));
    }

    /// @dev Corner: {a, a+1, a+3, a+4} with a >= 1 and a not in column 3.
    function _isCorner(uint64 mask) internal pure returns (bool) {
        uint256 a = _lowestBit(mask);
        return a >= 1 && a % 3 != 0 && mask == (uint64(0x1b) << uint64(a));
    }

    /// @dev Six line: {a .. a+5} with a in column 1.
    function _isSixLine(uint64 mask) internal pure returns (bool) {
        uint256 a = _lowestBit(mask);
        return a % 3 == 1 && mask == (uint64(0x3f) << uint64(a));
    }

    function _popcount(uint64 x) internal pure returns (uint256 c) {
        while (x != 0) {
            x &= x - 1;
            ++c;
        }
    }

    function _lowestBit(uint64 x) internal pure returns (uint256 i) {
        while ((x >> i) & 1 == 0) ++i;
    }

    function _highestBit(uint64 x) internal pure returns (uint256 i) {
        i = 63;
        while ((x >> i) & 1 == 0) --i;
    }
}
