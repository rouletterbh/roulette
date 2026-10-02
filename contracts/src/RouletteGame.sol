// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EmergencyPause} from "./EmergencyPause.sol";
import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";
import {IRiskEngine} from "./interfaces/IRiskEngine.sol";
import {ICasinoTreasury} from "./interfaces/ICasinoTreasury.sol";
import {IRandomnessSource} from "./interfaces/IRandomnessSource.sol";

/// @title RouletteGame
/// @notice Round lifecycle, bet acceptance, and settlement for European (single-zero) roulette.
///
/// @dev ESCROW MODEL. Players `enterTable` once, moving chips into an internal escrow balance
///      (the treasury burns the ERC-1155 tokens and books the units as escrow liability). Every bet
///      and payout afterwards is plain integer accounting on `escrow[player]`; `leaveTable` mints
///      chips back. Rationale: a round with N bets costs N storage writes instead of N ERC-1155
///      transfers with receiver hooks, and payouts never need denomination juggling. Chip liability
///      is unchanged by escrow (units in escrow are still units owed), so solvency math is identical.
///
///      SOLVENCY. Before EVERY wager the full bet set of the round is re-evaluated:
///        maximumLiability(allBetsInRound) <= (availableBankroll + roundReservation) * maxRoundExposureBps / 10_000
///      where `availableBankroll` already excludes every other open round's reservation. The
///      reservation of the round is then re-synced on the treasury, whose own `reserve()` check is a
///      second, independent guard. A wager that fails either check reverts with a typed error.
///
///      ADMIN BOUNDARY. There is no function that sets a result, edits a stored bet, moves escrow
///      between accounts, or settles a round twice. `cancelRound` exists only while a round is Open
///      (before any entropy exists) and refunds every stake in full.
///
///      Private tables: `isPrivate` is a flag for indexers/UI; invite enforcement is offchain
///      (the operator simply does not open rounds for uninvited players). Signature-based betting
///      is intentionally not included; `placeBets` is always called by the player.
contract RouletteGame is EmergencyPause, ReentrancyGuard {
    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_BETS_PER_ROUND_CAP = 1000;
    uint64 public constant MIN_ROUND_TIMEOUT = 1 hours;
    uint64 public constant MAX_ROUND_TIMEOUT = 30 days;

    enum RoundStatus {
        None,
        Open,
        Closed,
        Settled,
        Voided
    }

    struct Table {
        uint128 minStake;
        uint128 maxStake;
        bool isPrivate;
        bool active;
    }

    struct Round {
        uint32 tableId;
        RoundStatus status;
        uint8 result;
        uint32 betCount;
        uint64 openedAt;
        uint256 totalStaked;
        uint256 totalReturned;
        uint256 reservedUnits;
        bytes32 playerSeed;
    }

    struct PlacedBet {
        address player;
        uint64 numbersMask;
        uint16 multiplier;
        uint128 stake;
    }

    IRiskEngine public immutable RISK;
    ICasinoTreasury public immutable TREASURY;
    IRandomnessSource public immutable RANDOMNESS;

    uint32 public tableCount;
    uint256 public maxBetsPerRound;
    /// @notice Minimum available bankroll (units) for a round to open (`minBankrollToOpen` in economics.ts).
    uint256 public minBankrollToOpenUnits;
    /// @notice Seconds after which anyone may void a round still Open (operator failed to close it).
    uint64 public roundTimeout;

    mapping(uint32 tableId => Table) public tables;
    mapping(uint256 roundId => Round) private _rounds;
    mapping(uint256 roundId => PlacedBet[]) private _bets;
    mapping(address player => uint256) public escrow;

    // ---------------------------------------------------------------- events

    event TableCreated(uint32 indexed tableId, uint128 minStake, uint128 maxStake, bool isPrivate);
    event TableUpdated(uint32 indexed tableId, uint128 minStake, uint128 maxStake, bool isPrivate, bool active);
    event EscrowDeposited(address indexed player, uint256 units, uint256 balance);
    event EscrowWithdrawn(address indexed player, uint256 units, uint256 balance);
    event RoundOpened(uint256 indexed roundId, uint32 indexed tableId, address indexed operator);
    event BetPlaced(
        uint256 indexed roundId,
        address indexed player,
        uint256 betIndex,
        uint64 numbersMask,
        uint16 multiplier,
        uint128 stake
    );
    event RoundExposureUpdated(uint256 indexed roundId, uint256 maxNetPayoutUnits, uint256 maxRoundExposureUnits);
    event RoundClosed(uint256 indexed roundId, uint32 betCount, uint256 totalStaked, uint256 reservedUnits);
    event BetSettled(uint256 indexed roundId, uint256 betIndex, address indexed player, bool won, uint256 returned);
    event RoundSettled(uint256 indexed roundId, uint8 result, uint256 totalStaked, uint256 totalReturned);
    event RoundVoided(uint256 indexed roundId, uint256 refundedUnits, string reason);
    event MaxBetsPerRoundUpdated(uint256 previous, uint256 current);
    event MinBankrollToOpenUpdated(uint256 previous, uint256 current);
    event RoundTimeoutUpdated(uint64 previous, uint64 current);

    // ---------------------------------------------------------------- errors

    error InvalidRoundStatus(uint256 roundId, RoundStatus actual, RoundStatus expected);
    error CommitmentRequired(uint256 roundId);
    error ResultNotAvailable(uint256 roundId);
    error RoundNotVoidable(uint256 roundId);
    error TableNotActive(uint32 tableId);
    error InvalidTable(uint128 minStake, uint128 maxStake);
    error StakeOutOfRange(uint256 index, uint128 stake, uint128 minStake, uint128 maxStake);
    error InsufficientEscrow(uint256 required, uint256 balance);
    error TooManyBets(uint256 count, uint256 max);
    error InsufficientBankrollToOpen(uint256 available, uint256 minimum);
    error InvalidConfig();
    error ZeroAmount();

    constructor(address acl_, address risk_, address treasury_, address randomness_, uint256 minBankrollToOpenUnits_)
        RoleGated(acl_)
    {
        if (risk_ == address(0) || treasury_ == address(0) || randomness_ == address(0)) revert ZeroAddress();
        RISK = IRiskEngine(risk_);
        TREASURY = ICasinoTreasury(treasury_);
        RANDOMNESS = IRandomnessSource(randomness_);
        maxBetsPerRound = 256;
        minBankrollToOpenUnits = minBankrollToOpenUnits_;
        roundTimeout = 1 days;
    }

    // ----------------------------------------------------------------- views

    function getRound(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    function getBets(uint256 roundId) external view returns (PlacedBet[] memory) {
        return _bets[roundId];
    }

    /// @notice Largest single-bet stake currently acceptable for `multiplier` on an empty round.
    function maxStakeFor(uint16 multiplier) external view returns (uint256) {
        return RISK.maxSafeStake(TREASURY.availableBankrollUnits(), multiplier, 0, TREASURY.maxRoundExposureBps());
    }

    // ---------------------------------------------------------------- tables

    function createTable(uint128 minStake, uint128 maxStake, bool isPrivate)
        external
        onlyRole(Roles.OPERATOR_ROLE)
        returns (uint32 tableId)
    {
        if (minStake == 0 || minStake > maxStake) revert InvalidTable(minStake, maxStake);
        tableId = ++tableCount;
        tables[tableId] = Table({minStake: minStake, maxStake: maxStake, isPrivate: isPrivate, active: true});
        emit TableCreated(tableId, minStake, maxStake, isPrivate);
    }

    function setTable(uint32 tableId, uint128 minStake, uint128 maxStake, bool isPrivate, bool active)
        external
        onlyRole(Roles.OPERATOR_ROLE)
    {
        if (tableId == 0 || tableId > tableCount) revert TableNotActive(tableId);
        if (minStake == 0 || minStake > maxStake) revert InvalidTable(minStake, maxStake);
        tables[tableId] = Table({minStake: minStake, maxStake: maxStake, isPrivate: isPrivate, active: active});
        emit TableUpdated(tableId, minStake, maxStake, isPrivate, active);
    }

    // ---------------------------------------------------------------- escrow

    /// @notice Move chips into escrow. Requires `chip.setApprovalForAll(treasury, true)` once.
    function enterTable(uint256[] calldata ids, uint256[] calldata amounts)
        external
        whenNotPaused(PAUSE_GAMEPLAY)
        nonReentrant
    {
        uint256 units = TREASURY.escrowIn(msg.sender, ids, amounts);
        uint256 bal = escrow[msg.sender] + units;
        escrow[msg.sender] = bal;
        emit EscrowDeposited(msg.sender, units, bal);
    }

    /// @notice Mint escrowed units back as chips. Deliberately NOT pausable: admins cannot trap escrow.
    function leaveTable(uint256 units) external nonReentrant {
        if (units == 0) revert ZeroAmount();
        uint256 bal = escrow[msg.sender];
        if (units > bal) revert InsufficientEscrow(units, bal);
        bal -= units;
        escrow[msg.sender] = bal;
        emit EscrowWithdrawn(msg.sender, units, bal);
        TREASURY.escrowOut(msg.sender, units);
    }

    // ------------------------------------------------------------- lifecycle

    /// @notice Open a round. The operator must already have committed a seed hash for `roundId`.
    function openRound(uint256 roundId, uint32 tableId)
        external
        onlyRole(Roles.OPERATOR_ROLE)
        whenNotPaused(PAUSE_GAMEPLAY)
    {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.None) revert InvalidRoundStatus(roundId, r.status, RoundStatus.None);
        if (!tables[tableId].active) revert TableNotActive(tableId);
        if (!RANDOMNESS.isCommitted(roundId)) revert CommitmentRequired(roundId);
        uint256 available = TREASURY.availableBankrollUnits();
        if (available < minBankrollToOpenUnits) revert InsufficientBankrollToOpen(available, minBankrollToOpenUnits);

        r.tableId = tableId;
        r.status = RoundStatus.Open;
        r.openedAt = uint64(block.timestamp);
        emit RoundOpened(roundId, tableId, msg.sender);
    }

    /// @notice Place one or more bets from escrow. Reverts unless the whole round stays collateralised.
    function placeBets(uint256 roundId, IRiskEngine.Bet[] calldata bets)
        external
        whenNotPaused(PAUSE_GAMEPLAY)
        nonReentrant
    {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Open) revert InvalidRoundStatus(roundId, r.status, RoundStatus.Open);
        uint256 n = bets.length;
        if (n == 0) revert IRiskEngine.NoBets();
        PlacedBet[] storage stored = _bets[roundId];
        uint256 existing = stored.length;
        if (existing + n > maxBetsPerRound) revert TooManyBets(existing + n, maxBetsPerRound);

        Table memory t = tables[r.tableId];
        uint256 total;
        bytes32 seed = r.playerSeed;
        for (uint256 i; i < n; ++i) {
            IRiskEngine.Bet calldata b = bets[i];
            if (b.stake < t.minStake || b.stake > t.maxStake) {
                revert StakeOutOfRange(i, b.stake, t.minStake, t.maxStake);
            }
            total += b.stake;
            seed = keccak256(abi.encodePacked(seed, msg.sender, b.numbersMask, b.multiplier, b.stake));
            stored.push(PlacedBet({player: msg.sender, numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake}));
            emit BetPlaced(roundId, msg.sender, existing + i, b.numbersMask, b.multiplier, b.stake);
        }

        uint256 bal = escrow[msg.sender];
        if (total > bal) revert InsufficientEscrow(total, bal);
        escrow[msg.sender] = bal - total;
        r.totalStaked += total;
        r.betCount = uint32(existing + n);
        r.playerSeed = seed;

        // Solvency: evaluate the full round (validates geometry + multipliers of every bet).
        uint256 previousReservation = r.reservedUnits;
        uint256 availableExcludingThisRound = TREASURY.availableBankrollUnits() + previousReservation;
        (uint256 maxNetPayout, uint256 maxRoundExposure) =
            RISK.checkWager(availableExcludingThisRound, TREASURY.maxRoundExposureBps(), _betsOf(stored));
        emit RoundExposureUpdated(roundId, maxNetPayout, maxRoundExposure);

        r.reservedUnits = maxNetPayout;
        if (maxNetPayout > previousReservation) {
            TREASURY.reserve(maxNetPayout - previousReservation); // second, independent guard
        } else if (maxNetPayout < previousReservation) {
            TREASURY.release(previousReservation - maxNetPayout);
        }
    }

    /// @notice Stop accepting bets and freeze the player entropy on the randomness source.
    function closeRound(uint256 roundId) external onlyRole(Roles.OPERATOR_ROLE) {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Open) revert InvalidRoundStatus(roundId, r.status, RoundStatus.Open);
        r.status = RoundStatus.Closed;
        emit RoundClosed(roundId, r.betCount, r.totalStaked, r.reservedUnits);
        RANDOMNESS.lock(roundId, r.playerSeed);
    }

    /// @notice Settle a closed round once the result is revealed. Anyone may call. Idempotence is
    ///         enforced by the status transition Closed -> Settled; a settled round can never settle again.
    function settleRound(uint256 roundId) external nonReentrant {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Closed) revert InvalidRoundStatus(roundId, r.status, RoundStatus.Closed);
        IRandomnessSource.RoundStatus rs = RANDOMNESS.status(roundId);
        if (rs == IRandomnessSource.RoundStatus.Void) {
            _refund(r, roundId, "entropy window missed");
            return;
        }
        if (rs != IRandomnessSource.RoundStatus.Revealed) revert ResultNotAvailable(roundId);
        uint8 result = RANDOMNESS.result(roundId);

        r.status = RoundStatus.Settled; // effect first: re-entry or a second call cannot pass the guard
        r.result = result;

        PlacedBet[] storage stored = _bets[roundId];
        uint256 n = stored.length;
        uint256 returned;
        for (uint256 i; i < n; ++i) {
            PlacedBet storage b = stored[i];
            bool won = (b.numbersMask >> result) & 1 == 1;
            uint256 ret;
            if (won) {
                ret = RISK.payout(b.stake, b.multiplier);
                escrow[b.player] += ret;
                returned += ret;
            }
            emit BetSettled(roundId, i, b.player, won, ret);
        }
        r.totalReturned = returned;
        uint256 reserved = r.reservedUnits;
        r.reservedUnits = 0;
        emit RoundSettled(roundId, result, r.totalStaked, returned);
        TREASURY.settle(roundId, r.totalStaked, returned, reserved);
    }

    /// @notice Refund a round that can no longer produce a result: a Closed round whose reveal window
    ///         expired, or an Open round the operator abandoned for longer than `roundTimeout`.
    ///         Anyone may call, so escrow can never be trapped by an unresponsive operator.
    function voidRound(uint256 roundId) external nonReentrant {
        Round storage r = _rounds[roundId];
        if (r.status == RoundStatus.Open) {
            if (block.timestamp < uint256(r.openedAt) + roundTimeout) revert RoundNotVoidable(roundId);
            _refund(r, roundId, "open round timed out");
            return;
        }
        if (r.status != RoundStatus.Closed) revert InvalidRoundStatus(roundId, r.status, RoundStatus.Closed);
        IRandomnessSource.RoundStatus rs = RANDOMNESS.status(roundId);
        if (rs == IRandomnessSource.RoundStatus.Locked) {
            RANDOMNESS.markVoid(roundId); // reverts unless the blockhash window has expired
        } else if (rs != IRandomnessSource.RoundStatus.Void) {
            revert RoundNotVoidable(roundId);
        }
        _refund(r, roundId, "entropy window missed");
    }

    /// @notice Operator cancels an OPEN round (no entropy exists yet). Every stake is refunded.
    function cancelRound(uint256 roundId) external onlyRole(Roles.OPERATOR_ROLE) nonReentrant {
        Round storage r = _rounds[roundId];
        if (r.status != RoundStatus.Open) revert InvalidRoundStatus(roundId, r.status, RoundStatus.Open);
        _refund(r, roundId, "cancelled by operator before close");
    }

    // ----------------------------------------------------------------- admin

    function setMaxBetsPerRound(uint256 value) external onlyRole(Roles.ADMIN_ROLE) {
        if (value == 0 || value > MAX_BETS_PER_ROUND_CAP) revert InvalidConfig();
        emit MaxBetsPerRoundUpdated(maxBetsPerRound, value);
        maxBetsPerRound = value;
    }

    function setMinBankrollToOpen(uint256 units) external onlyRole(Roles.ADMIN_ROLE) {
        emit MinBankrollToOpenUpdated(minBankrollToOpenUnits, units);
        minBankrollToOpenUnits = units;
    }

    function setRoundTimeout(uint64 seconds_) external onlyRole(Roles.ADMIN_ROLE) {
        if (seconds_ < MIN_ROUND_TIMEOUT || seconds_ > MAX_ROUND_TIMEOUT) revert InvalidConfig();
        emit RoundTimeoutUpdated(roundTimeout, seconds_);
        roundTimeout = seconds_;
    }

    // -------------------------------------------------------------- internal

    function _refund(Round storage r, uint256 roundId, string memory reason) internal {
        r.status = RoundStatus.Voided;
        PlacedBet[] storage stored = _bets[roundId];
        uint256 n = stored.length;
        for (uint256 i; i < n; ++i) {
            PlacedBet storage b = stored[i];
            escrow[b.player] += b.stake;
        }
        uint256 staked = r.totalStaked;
        uint256 reserved = r.reservedUnits;
        r.reservedUnits = 0;
        r.totalReturned = staked;
        emit RoundVoided(roundId, staked, reason);
        TREASURY.settle(roundId, staked, staked, reserved);
    }

    function _betsOf(PlacedBet[] storage stored) internal view returns (IRiskEngine.Bet[] memory out) {
        uint256 n = stored.length;
        out = new IRiskEngine.Bet[](n);
        for (uint256 i; i < n; ++i) {
            PlacedBet storage b = stored[i];
            out[i] = IRiskEngine.Bet({numbersMask: b.numbersMask, multiplier: b.multiplier, stake: b.stake});
        }
    }
}
