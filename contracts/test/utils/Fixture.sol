// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTest} from "./BaseTest.sol";
import {MockERC20, MockOracle} from "./Mocks.sol";
import {AccessController} from "../../src/AccessController.sol";
import {Chip1155} from "../../src/Chip1155.sol";
import {CasinoTreasury} from "../../src/CasinoTreasury.sol";
import {RiskEngine} from "../../src/RiskEngine.sol";
import {RandomnessManager} from "../../src/RandomnessManager.sol";
import {RouletteGame} from "../../src/RouletteGame.sol";
import {RewardVault} from "../../src/RewardVault.sol";
import {PlayerRegistry} from "../../src/PlayerRegistry.sol";
import {Roles} from "../../src/Roles.sol";
import {IRiskEngine} from "../../src/interfaces/IRiskEngine.sol";

/// @title Fixture
/// @notice Deploys the full stack with the economics.ts defaults and exposes bet/round helpers.
/// @dev Unit economics in tests: chipPriceWei = 1e15 (1 unit = 0.001 ETH), chipUsdValue = 1e18.
///      Founder funding of 100 ether => bankroll 100_000 units => available 85_000 => cap 21_250.
abstract contract Fixture is BaseTest {
    uint256 internal constant CHIP_PRICE = 1e15;
    uint256 internal constant CHIP_USD = 1e18;
    uint256 internal constant MIN_BANKROLL_TO_OPEN = 25;
    uint64 internal constant REVEAL_DELAY = 1;

    address internal admin = address(this);
    address internal operator = address(0xA11CE);
    address internal pauser = address(0xBEEF);
    address internal treasurer = address(0xCAFE);
    address internal alice = address(0x1111);
    address internal bob = address(0x2222);
    address internal carol = address(0x3333);
    address internal stranger = address(0x9999);

    AccessController internal acl;
    Chip1155 internal chip;
    CasinoTreasury internal treasury;
    RiskEngine internal risk;
    RandomnessManager internal randomness;
    RouletteGame internal game;
    RewardVault internal vault;
    PlayerRegistry internal registry;
    MockERC20 internal token;
    MockOracle internal oracle;

    uint32 internal tableId;

    function deployStack() internal {
        acl = new AccessController(admin, 0);
        chip = new Chip1155(address(acl), "ipfs://chips/{id}.json");
        treasury = new CasinoTreasury(
            address(acl),
            address(chip),
            CHIP_PRICE,
            CHIP_USD,
            CasinoTreasury.SplitConfig({
                payoutLiquidityBps: 7000,
                rewardInventoryBps: 2000,
                protocolReserveBps: 800,
                platformFeeBps: 200
            }),
            CasinoTreasury.RiskConfig({safetyReserveBps: 1500, maxRoundExposureBps: 2500})
        );
        risk = new RiskEngine();
        randomness = new RandomnessManager(address(acl), REVEAL_DELAY);
        game = new RouletteGame(address(acl), address(risk), address(treasury), address(randomness), MIN_BANKROLL_TO_OPEN);
        vault = new RewardVault(address(acl));
        registry = new PlayerRegistry();
        token = new MockERC20("Mock Stock Token", "MST", 18);
        oracle = new MockOracle();

        acl.grantRole(Roles.OPERATOR_ROLE, operator);
        acl.grantRole(Roles.PAUSER_ROLE, pauser);
        acl.grantRole(Roles.TREASURER_ROLE, treasurer);
        acl.grantRole(Roles.GAME_ROLE, address(game));
        acl.grantRole(Roles.MINTER_ROLE, address(treasury));
        acl.grantRole(Roles.REWARD_CREDITOR_ROLE, address(treasury));
        treasury.setRewardVault(address(vault));

        vm.prank(operator);
        tableId = game.createTable(1, 10_000, false);

        vm.label(operator, "operator");
        vm.label(alice, "alice");
        vm.label(bob, "bob");
        vm.roll(100);
        vm.warp(1_700_000_000);
    }

    /// @dev Founder capital, no chips minted.
    function fundHouse(uint256 amountWei) internal {
        vm.deal(admin, admin.balance + amountWei);
        treasury.fundBankroll{value: amountWei}();
    }

    /// @dev Deposit ETH as `player`, approve the treasury for chip burns.
    function buyChips(address player, uint256 amountWei) internal returns (uint256 units) {
        vm.deal(player, player.balance + amountWei);
        vm.startPrank(player);
        uint256 before = chipUnitsOf(player);
        treasury.deposit{value: amountWei}();
        chip.setApprovalForAll(address(treasury), true);
        vm.stopPrank();
        units = chipUnitsOf(player) - before;
    }

    function chipUnitsOf(address player) internal view returns (uint256 units) {
        uint256[6] memory d = chip.denominations();
        for (uint256 i; i < 6; ++i) {
            units += chip.balanceOf(player, 1000 + d[i]) * d[i];
        }
    }

    function heldChips(address player) internal view returns (uint256[] memory ids, uint256[] memory amounts) {
        uint256[6] memory d = chip.denominations();
        uint256 n;
        for (uint256 i; i < 6; ++i) {
            if (chip.balanceOf(player, 1000 + d[i]) != 0) ++n;
        }
        ids = new uint256[](n);
        amounts = new uint256[](n);
        uint256 k;
        for (uint256 i; i < 6; ++i) {
            uint256 bal = chip.balanceOf(player, 1000 + d[i]);
            if (bal != 0) {
                ids[k] = 1000 + d[i];
                amounts[k] = bal;
                ++k;
            }
        }
    }

    /// @dev Move every chip `player` holds into game escrow.
    function enterAll(address player) internal returns (uint256 units) {
        (uint256[] memory ids, uint256[] memory amounts) = heldChips(player);
        units = chip.totalValue(ids, amounts);
        vm.prank(player);
        game.enterTable(ids, amounts);
    }

    /// @dev Buy chips with `amountWei` and move them all into escrow.
    function seatPlayer(address player, uint256 amountWei) internal returns (uint256 units) {
        buyChips(player, amountWei);
        units = enterAll(player);
    }

    // ------------------------------------------------------------ bet helpers

    function maskOf(uint8[] memory numbers) internal pure returns (uint64 m) {
        for (uint256 i; i < numbers.length; ++i) m |= uint64(1) << numbers[i];
    }

    function straightMask(uint8 n) internal pure returns (uint64) {
        return uint64(1) << n;
    }

    function bet(uint64 mask, uint16 multiplier, uint128 stake) internal pure returns (IRiskEngine.Bet memory) {
        return IRiskEngine.Bet({numbersMask: mask, multiplier: multiplier, stake: stake});
    }

    function one(IRiskEngine.Bet memory b) internal pure returns (IRiskEngine.Bet[] memory arr) {
        arr = new IRiskEngine.Bet[](1);
        arr[0] = b;
    }

    function two(IRiskEngine.Bet memory a, IRiskEngine.Bet memory b) internal pure returns (IRiskEngine.Bet[] memory arr) {
        arr = new IRiskEngine.Bet[](2);
        arr[0] = a;
        arr[1] = b;
    }

    // ---------------------------------------------------------- round helpers

    function commitment(bytes32 serverSeed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(serverSeed));
    }

    function commitRound(uint256 roundId, bytes32 serverSeed) internal {
        vm.prank(operator);
        randomness.commit(roundId, commitment(serverSeed));
    }

    function openRound(uint256 roundId, bytes32 serverSeed) internal {
        commitRound(roundId, serverSeed);
        vm.prank(operator);
        game.openRound(roundId, tableId);
    }

    function placeAs(address player, uint256 roundId, IRiskEngine.Bet[] memory bets) internal {
        vm.prank(player);
        game.placeBets(roundId, bets);
    }

    function closeRound(uint256 roundId) internal {
        vm.prank(operator);
        game.closeRound(roundId);
    }

    /// @dev Close, advance past the entropy block and reveal. Returns the result.
    function closeAndReveal(uint256 roundId, bytes32 serverSeed) internal returns (uint8) {
        closeRound(roundId);
        vm.roll(randomness.revealAfterBlock(roundId) + 1);
        vm.prank(operator);
        randomness.reveal(roundId, serverSeed);
        return randomness.result(roundId);
    }

    /// @dev Expected result for a locked round, computed exactly as the contract does.
    function expectedResult(uint256 roundId, bytes32 serverSeed) internal view returns (uint8) {
        RandomnessManager.Round memory r = randomness.getRound(roundId);
        return randomness.deriveResult(serverSeed, r.playerSeed, blockhash(r.revealAfterBlock), roundId);
    }

    /// @dev Play a full round with one bet from `player`, settle it, and return the result.
    function playRound(uint256 roundId, bytes32 serverSeed, address player, IRiskEngine.Bet[] memory bets)
        internal
        returns (uint8 result)
    {
        openRound(roundId, serverSeed);
        placeAs(player, roundId, bets);
        result = closeAndReveal(roundId, serverSeed);
        game.settleRound(roundId);
    }

    // --------------------------------------------------------- reward helpers

    function registerMockAsset() internal {
        oracle.set(address(token), 2e18, block.timestamp); // $2 per token
        vault.registerAsset(
            address(token),
            RewardVault.AssetConfig({
                enabled: true,
                decimals: 18,
                maxStaleness: 1 hours,
                oracle: address(oracle),
                minimumPayoutUsd: 1e18,
                lowWatermark: 10e18
            })
        );
    }

    function fundVault(uint256 amount) internal {
        token.mint(treasurer, amount);
        vm.startPrank(treasurer);
        token.approve(address(vault), amount);
        vault.fundInventory(address(token), amount);
        vm.stopPrank();
    }
}
