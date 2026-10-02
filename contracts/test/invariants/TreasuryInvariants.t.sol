// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTest, InvariantBase} from "../utils/BaseTest.sol";
import {Fixture} from "../utils/Fixture.sol";
import {MockERC20, MockOracle} from "../utils/Mocks.sol";
import {CasinoTreasury} from "../../src/CasinoTreasury.sol";
import {Chip1155} from "../../src/Chip1155.sol";
import {RouletteGame} from "../../src/RouletteGame.sol";
import {RandomnessManager} from "../../src/RandomnessManager.sol";
import {RewardVault} from "../../src/RewardVault.sol";
import {RiskEngine} from "../../src/RiskEngine.sol";
import {IRiskEngine} from "../../src/interfaces/IRiskEngine.sol";

/// @dev Random-action handler driven by forge's invariant fuzzer. Every call is a legal user,
///      operator or treasurer action; reverts from legitimately rejected actions are swallowed and
///      counted so that the invariants below are checked across accepted AND rejected wagers.
contract TreasuryHandler is BaseTest {
    CasinoTreasury internal treasury;
    Chip1155 internal chip;
    RouletteGame internal game;
    RandomnessManager internal randomness;
    RewardVault internal vault;
    RiskEngine internal risk;
    MockERC20 internal token;
    MockOracle internal oracle;
    address internal operator;
    address internal treasurer;
    uint32 internal tableId;

    address[] public players;
    uint256[] public unsettledRounds;
    uint256[] public settledRounds;
    mapping(uint256 => bytes32) internal seeds;
    uint256 public nextRoundId = 1;

    uint256 public ghost_doubleSettles;
    uint256 public ghost_doubleClaims;
    uint256 public ghost_wagersAccepted;
    uint256 public ghost_wagersRejected;

    struct Deps {
        CasinoTreasury treasury;
        Chip1155 chip;
        RouletteGame game;
        RandomnessManager randomness;
        RewardVault vault;
        RiskEngine risk;
        MockERC20 token;
        MockOracle oracle;
        address operator;
        address treasurer;
        uint32 tableId;
    }

    constructor(Deps memory d, address[] memory players_) {
        treasury = d.treasury;
        chip = d.chip;
        game = d.game;
        randomness = d.randomness;
        vault = d.vault;
        risk = d.risk;
        token = d.token;
        oracle = d.oracle;
        operator = d.operator;
        treasurer = d.treasurer;
        tableId = d.tableId;
        players = players_;
    }

    // --------------------------------------------------------------- views

    function playersLength() external view returns (uint256) {
        return players.length;
    }

    function unsettledLength() external view returns (uint256) {
        return unsettledRounds.length;
    }

    function settledLength() external view returns (uint256) {
        return settledRounds.length;
    }

    // -------------------------------------------------------------- actions

    function deposit(uint256 seed, uint256 amount) external {
        address p = _player(seed);
        amount = _bound(amount, 1e16, 20 ether);
        vm.deal(p, p.balance + amount);
        vm.startPrank(p);
        treasury.deposit{value: amount}();
        chip.setApprovalForAll(address(treasury), true);
        vm.stopPrank();
    }

    function fundHouse(uint256 amount) external {
        amount = _bound(amount, 1e16, 50 ether);
        vm.deal(address(this), amount);
        treasury.fundBankroll{value: amount}();
    }

    function enterTable(uint256 seed) external {
        address p = _player(seed);
        (uint256[] memory ids, uint256[] memory amts) = _held(p);
        if (ids.length == 0) return;
        vm.prank(p);
        game.enterTable(ids, amts);
    }

    function leaveTable(uint256 seed, uint256 units) external {
        address p = _player(seed);
        uint256 bal = game.escrow(p);
        if (bal == 0) return;
        units = _bound(units, 1, bal);
        vm.prank(p);
        game.leaveTable(units);
    }

    function redeem(uint256 seed) external {
        address p = _player(seed);
        (uint256[] memory ids, uint256[] memory amts) = _held(p);
        if (ids.length == 0) return;
        vm.startPrank(p);
        treasury.redeem(ids, amts);
        treasury.withdraw();
        vm.stopPrank();
    }

    function playRound(uint256 seed, uint256 kind, uint256 stake) external {
        address p = _player(seed);
        uint256 bal = game.escrow(p);
        if (bal == 0) return;

        uint256 id = nextRoundId++;
        bytes32 serverSeed = keccak256(abi.encodePacked("seed", id));
        seeds[id] = serverSeed;
        vm.prank(operator);
        randomness.commit(id, keccak256(abi.encodePacked(serverSeed)));
        vm.prank(operator);
        try game.openRound(id, tableId) {}
        catch {
            return; // bankroll below minimum to open
        }

        IRiskEngine.Bet[] memory bets = new IRiskEngine.Bet[](1);
        uint64 mask;
        uint16 mult;
        kind = kind % 4;
        if (kind == 0) {
            mask = uint64(1) << uint64(seed % 37);
            mult = 35;
        } else if (kind == 1) {
            mask = risk.MASK_RED();
            mult = 1;
        } else if (kind == 2) {
            mask = risk.MASK_DOZEN_1();
            mult = 2;
        } else {
            mask = uint64(3) << 1; // split 1-2
            mult = 17;
        }
        stake = _bound(stake, 1, bal < 10_000 ? bal : 10_000);
        bets[0] = IRiskEngine.Bet({numbersMask: mask, multiplier: mult, stake: uint128(stake)});

        vm.prank(p);
        try game.placeBets(id, bets) {
            ++ghost_wagersAccepted;
        } catch {
            ++ghost_wagersRejected; // ExposureCapExceeded or similar: must leave state untouched
        }
        unsettledRounds.push(id);
        if (seed % 2 == 0) _finish(id);
    }

    function finishRounds() external {
        while (unsettledRounds.length != 0) {
            _finish(unsettledRounds[unsettledRounds.length - 1]);
        }
    }

    function resettle(uint256 seed) external {
        if (settledRounds.length == 0) return;
        uint256 id = settledRounds[seed % settledRounds.length];
        try game.settleRound(id) {
            ++ghost_doubleSettles;
        } catch {}
    }

    function convertAndClaim(uint256 seed) external {
        address p = _player(seed);
        (uint256[] memory ids, uint256[] memory amts) = _held(p);
        if (ids.length != 0) {
            vm.prank(p);
            treasury.convertToRewards(ids, amts);
        }
        uint256 wb = vault.winBalance(p);
        if (wb == 0) return;
        oracle.set(address(token), 2e18, block.timestamp);
        vm.prank(p);
        try vault.claimAs(address(token), wb, 0, block.timestamp + 1) {}
        catch {
            return; // inventory short: balance must be intact
        }
        vm.prank(p);
        try vault.claimAs(address(token), wb, 0, block.timestamp + 1) {
            ++ghost_doubleClaims;
        } catch {}
    }

    function treasurerSkim(uint256 amount) external {
        uint256 s = treasury.surplus();
        if (s != 0) {
            vm.prank(treasurer);
            treasury.withdrawSurplus(treasurer, _bound(amount, 1, s));
        }
        uint256 rev = treasury.revenue();
        if (rev != 0) {
            vm.prank(treasurer);
            treasury.withdrawRevenue(treasurer, rev);
        }
    }

    // ------------------------------------------------------------- internal

    function _finish(uint256 id) internal {
        RouletteGame.Round memory r = game.getRound(id);
        if (r.status == RouletteGame.RoundStatus.Open) {
            vm.prank(operator);
            game.closeRound(id);
        }
        vm.roll(randomness.revealAfterBlock(id) + 1);
        vm.prank(operator);
        randomness.reveal(id, seeds[id]);
        game.settleRound(id);
        settledRounds.push(id);
        _removeUnsettled(id);
    }

    function _removeUnsettled(uint256 id) internal {
        uint256 n = unsettledRounds.length;
        for (uint256 i; i < n; ++i) {
            if (unsettledRounds[i] == id) {
                unsettledRounds[i] = unsettledRounds[n - 1];
                unsettledRounds.pop();
                return;
            }
        }
    }

    function _player(uint256 seed) internal view returns (address) {
        return players[seed % players.length];
    }

    function _bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (lo >= hi) return lo;
        return lo + (x % (hi - lo + 1));
    }

    function _held(address p) internal view returns (uint256[] memory ids, uint256[] memory amounts) {
        uint256[6] memory d = chip.denominations();
        uint256 n;
        for (uint256 i; i < 6; ++i) {
            if (chip.balanceOf(p, 1000 + d[i]) != 0) ++n;
        }
        ids = new uint256[](n);
        amounts = new uint256[](n);
        uint256 k;
        for (uint256 i; i < 6; ++i) {
            uint256 bal = chip.balanceOf(p, 1000 + d[i]);
            if (bal != 0) {
                ids[k] = 1000 + d[i];
                amounts[k] = bal;
                ++k;
            }
        }
    }
}

/// @title TreasuryInvariants
/// @notice Properties that must hold after ANY sequence of handler actions:
///   1. assets >= liabilities (treasury.isSolvent, I1+I2)
///   2. reservedLiability == sum of maximum outstanding net payout of unsettled rounds
///   3. totalClaims <= rewardInventory funded
///   4. withdrawable surplus <= bankroll - liabilities
///   5. a wager cannot create insolvency (bankroll always covers reserved + claimable + reserve)
///   6. a settled round cannot settle twice
///   7. a claim cannot execute twice
///   8. escrow ledger == treasury escrow liability
contract TreasuryInvariants is Fixture, InvariantBase {
    TreasuryHandler internal handler;

    function setUp() public {
        deployStack();
        fundHouse(100 ether);
        registerMockAsset();
        fundVault(1_000_000e18);

        address[] memory ps = new address[](3);
        ps[0] = alice;
        ps[1] = bob;
        ps[2] = carol;
        handler = new TreasuryHandler(
            TreasuryHandler.Deps({
                treasury: treasury,
                chip: chip,
                game: game,
                randomness: randomness,
                vault: vault,
                risk: risk,
                token: token,
                oracle: oracle,
                operator: operator,
                treasurer: treasurer,
                tableId: tableId
            }),
            ps
        );
        targetContract(address(handler));
    }

    function invariant_assetsCoverLiabilities() public view {
        assertTrue(treasury.isSolvent(), "I1/I2: assets >= liabilities");
        assertGe(address(treasury).balance, treasury.totalWithdrawable(), "pull-payment credits are backed");
    }

    function invariant_reservedLiabilityMatchesOpenRounds() public view {
        uint256 sum;
        uint256 n = handler.unsettledLength();
        for (uint256 i; i < n; ++i) {
            sum += game.getRound(handler.unsettledRounds(i)).reservedUnits;
        }
        assertEq(treasury.reservedUnits(), sum, "I3: reservation equals worst-case net payout of open rounds");
    }

    function invariant_claimsNeverExceedFunded() public view {
        assertLe(vault.totalClaimed(address(token)), vault.totalFunded(address(token)), "claims <= inventory funded");
        assertLe(vault.totalClaimedUsd(), vault.totalCreditedUsd(), "claimed usd <= credited usd");
        assertEq(vault.totalWinBalance(), vault.totalCreditedUsd() - vault.totalClaimedUsd());
    }

    function invariant_surplusBounded() public view {
        assertLe(treasury.surplus() + treasury.liabilities(), treasury.bankroll() + 1, "I4: withdrawable <= bankroll - liabilities");
    }

    function invariant_wagerCannotCreateInsolvency() public view {
        assertGe(
            treasury.bankroll(),
            treasury.reservedLiability() + treasury.claimable() + treasury.protocolReserve(),
            "reserved payouts are always fully backed by house equity"
        );
    }

    function invariant_settledRoundNeverSettlesTwice() public view {
        assertEq(handler.ghost_doubleSettles(), 0, "double settlement");
    }

    function invariant_claimNeverExecutesTwice() public view {
        assertEq(handler.ghost_doubleClaims(), 0, "double claim");
    }

    function invariant_escrowLedgerMatchesTreasury() public view {
        uint256 sum;
        uint256 np = handler.playersLength();
        for (uint256 i; i < np; ++i) {
            sum += game.escrow(handler.players(i));
        }
        uint256 nr = handler.unsettledLength();
        for (uint256 i; i < nr; ++i) {
            sum += game.getRound(handler.unsettledRounds(i)).totalStaked;
        }
        assertEq(treasury.escrowUnits(), sum, "escrow balances + stakes in flight == escrow liability");
    }

    function invariant_chipSupplyMatchesWallets() public view {
        uint256 sum;
        uint256 np = handler.playersLength();
        for (uint256 i; i < np; ++i) {
            sum += chipUnitsOf(handler.players(i));
        }
        assertEq(chip.totalUnits(), sum, "every chip unit is in a known wallet");
    }
}
