// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ScriptBase} from "./utils/ScriptBase.sol";
import {AccessController} from "../src/AccessController.sol";
import {Chip1155} from "../src/Chip1155.sol";
import {CasinoTreasury} from "../src/CasinoTreasury.sol";
import {RiskEngine} from "../src/RiskEngine.sol";
import {RandomnessManager} from "../src/RandomnessManager.sol";
import {RouletteGame} from "../src/RouletteGame.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {PlayerRegistry} from "../src/PlayerRegistry.sol";
import {Roles} from "../src/Roles.sol";

/// @title Deploy
/// @notice Deploys and wires the full stack on Robinhood Chain (testnet 46630 first, then mainnet 4663).
///
/// Required env:
///   PRIVATE_KEY            deployer key (forge --private-key / --account also works)
///   ADMIN                  final admin (multisig on mainnet). Deployer is initial admin to wire roles,
///                          then begins a two-step transfer to ADMIN when ADMIN != deployer.
///   OPERATOR               server key that commits/reveals and opens/closes rounds
///   PAUSER                 incident-response key
///   TREASURER              key allowed to move earmarked buckets
/// Optional env (defaults mirror src/config/economics.ts and the test fixture):
///   CHIP_PRICE_WEI (1e15)  CHIP_USD_VALUE (1e18)  CHIP_BASE_URI ("")
///   PAYOUT_LIQUIDITY_BPS (7000)  REWARD_INVENTORY_BPS (2000)  PROTOCOL_RESERVE_BPS (800)  PLATFORM_FEE_BPS (200)
///   SAFETY_RESERVE_BPS (1500)  MAX_ROUND_EXPOSURE_BPS (2500)  MIN_BANKROLL_TO_OPEN_UNITS (25)
///   REVEAL_DELAY_BLOCKS (2)  ADMIN_TRANSFER_DELAY (86400)  INITIAL_BANKROLL_WEI (0)
///   TABLE_MIN_STAKE (1)  TABLE_MAX_STAKE (1000)
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url $ROBINHOOD_TESTNET_RPC_URL --broadcast --verify
contract Deploy is ScriptBase {
    struct Addresses {
        address acl;
        address chip;
        address treasury;
        address risk;
        address randomness;
        address game;
        address vault;
        address registry;
    }

    struct Config {
        address admin;
        address operator;
        address pauser;
        address treasurer;
        uint256 chipPriceWei;
        uint256 chipUsdValue;
        string baseUri;
        uint256 revealDelay;
        uint256 adminDelay;
        uint256 minToOpen;
        uint256 initialBankroll;
        uint256 tableMin;
        uint256 tableMax;
        CasinoTreasury.SplitConfig split;
        CasinoTreasury.RiskConfig risk;
    }

    function config() internal view returns (Config memory c) {
        c.admin = vm.envAddress("ADMIN");
        c.operator = vm.envAddress("OPERATOR");
        c.pauser = vm.envAddress("PAUSER");
        c.treasurer = vm.envAddress("TREASURER");
        c.chipPriceWei = vm.envOr("CHIP_PRICE_WEI", uint256(1e15));
        c.chipUsdValue = vm.envOr("CHIP_USD_VALUE", uint256(1e18));
        c.baseUri = vm.envOr("CHIP_BASE_URI", string(""));
        c.revealDelay = vm.envOr("REVEAL_DELAY_BLOCKS", uint256(2));
        c.adminDelay = vm.envOr("ADMIN_TRANSFER_DELAY", uint256(1 days));
        c.minToOpen = vm.envOr("MIN_BANKROLL_TO_OPEN_UNITS", uint256(25));
        c.initialBankroll = vm.envOr("INITIAL_BANKROLL_WEI", uint256(0));
        c.tableMin = vm.envOr("TABLE_MIN_STAKE", uint256(1));
        c.tableMax = vm.envOr("TABLE_MAX_STAKE", uint256(1000));
        c.split = CasinoTreasury.SplitConfig({
            payoutLiquidityBps: uint16(vm.envOr("PAYOUT_LIQUIDITY_BPS", uint256(7000))),
            rewardInventoryBps: uint16(vm.envOr("REWARD_INVENTORY_BPS", uint256(2000))),
            protocolReserveBps: uint16(vm.envOr("PROTOCOL_RESERVE_BPS", uint256(800))),
            platformFeeBps: uint16(vm.envOr("PLATFORM_FEE_BPS", uint256(200)))
        });
        c.risk = CasinoTreasury.RiskConfig({
            safetyReserveBps: uint16(vm.envOr("SAFETY_RESERVE_BPS", uint256(1500))),
            maxRoundExposureBps: uint16(vm.envOr("MAX_ROUND_EXPOSURE_BPS", uint256(2500)))
        });
    }

    function run() external returns (Addresses memory a) {
        Config memory c = config();
        vm.startBroadcast();
        a = _deployCore(c, msg.sender);
        _wire(c, a, msg.sender);
        vm.stopBroadcast();
    }

    /// @dev Steps 1-8: deploy in dependency order. Deployer is initial admin so it can wire roles.
    function _deployCore(Config memory c, address deployer) internal returns (Addresses memory a) {
        AccessController acl = new AccessController(deployer, uint48(c.adminDelay));
        a.acl = address(acl);
        emit Deployed("AccessController", a.acl);

        a.chip = address(new Chip1155(a.acl, c.baseUri));
        emit Deployed("Chip1155", a.chip);

        a.treasury = address(new CasinoTreasury(a.acl, a.chip, c.chipPriceWei, c.chipUsdValue, c.split, c.risk));
        emit Deployed("CasinoTreasury", a.treasury);

        a.risk = address(new RiskEngine());
        emit Deployed("RiskEngine", a.risk);

        a.randomness = address(new RandomnessManager(a.acl, uint64(c.revealDelay)));
        emit Deployed("RandomnessManager", a.randomness);

        a.game = address(new RouletteGame(a.acl, a.risk, a.treasury, a.randomness, c.minToOpen));
        emit Deployed("RouletteGame", a.game);

        a.vault = address(new RewardVault(a.acl));
        emit Deployed("RewardVault", a.vault);

        a.registry = address(new PlayerRegistry());
        emit Deployed("PlayerRegistry", a.registry);
    }

    /// @dev Steps 9-13: roles, first table, optional funding, admin hand-off.
    function _wire(Config memory c, Addresses memory a, address deployer) internal {
        AccessController acl = AccessController(a.acl);
        CasinoTreasury treasury = CasinoTreasury(payable(a.treasury));
        RouletteGame game = RouletteGame(a.game);

        // Contract roles.
        acl.grantRole(Roles.GAME_ROLE, a.game);
        acl.grantRole(Roles.MINTER_ROLE, a.treasury);
        acl.grantRole(Roles.REWARD_CREDITOR_ROLE, a.treasury);
        treasury.setRewardVault(a.vault);

        // Human roles.
        acl.grantRole(Roles.OPERATOR_ROLE, c.operator);
        acl.grantRole(Roles.PAUSER_ROLE, c.pauser);
        acl.grantRole(Roles.TREASURER_ROLE, c.treasurer);

        // First public table (deployer temporarily acts as operator).
        acl.grantRole(Roles.OPERATOR_ROLE, deployer);
        game.createTable(uint128(c.tableMin), uint128(c.tableMax), false);
        acl.revokeRole(Roles.OPERATOR_ROLE, deployer);

        // Optional founder funding (house equity, no chips).
        if (c.initialBankroll != 0) treasury.fundBankroll{value: c.initialBankroll}();

        // Hand admin to the multisig (two-step; ADMIN calls acceptDefaultAdminTransfer after the delay).
        if (c.admin != deployer) acl.beginDefaultAdminTransfer(c.admin);
    }
}
