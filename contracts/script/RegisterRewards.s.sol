// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ScriptBase} from "./utils/ScriptBase.sol";
import {PostedPriceOracle} from "../src/PostedPriceOracle.sol";
import {RewardVault} from "../src/RewardVault.sol";

/// @title RegisterRewards
/// @notice Registers the three confirmed Robinhood Chain ecosystem reward assets on an
///         existing RewardVault, deploying (or reusing) a PostedPriceOracle, seeding the
///         first prices, and enabling claims. Run as ADMIN (or the deployer while it still
///         holds the admin role).
///
/// Required env:
///   ACL                    AccessController address
///   VAULT                  RewardVault address
/// Optional env:
///   ORACLE                 existing PostedPriceOracle (deploys a new one when unset)
///   MAX_STALENESS          seconds, default 900 (15 minutes)
///   MINIMUM_PAYOUT_USD_1E18 default 0.5e18
///   PRICE_CASHCAT_1E18 / PRICE_PONS_1E18 / PRICE_AI_1E18   seed prices (USD 1e18); skipped when 0
///   LOW_WATERMARK_USD_1E18 default 10e18 (converted to base units with the seed price)
///
/// Funding inventory is a separate step (see FundRewards.s.sol) because it moves tokens
/// from the TREASURER wallet.
contract RegisterRewards is ScriptBase {
    address constant CASHCAT = 0x020bfC650A365f8BB26819deAAbF3E21291018b4;
    address constant PONS = 0x39dBED3a2bd333467115dE45665cC57F813C4571;
    address constant AI = 0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18;

    function run() external returns (address oracleAddr) {
        address acl = vm.envAddress("ACL");
        RewardVault vault = RewardVault(vm.envAddress("VAULT"));
        uint32 staleness = uint32(vm.envOr("MAX_STALENESS", uint256(900)));
        uint128 minPayout = uint128(vm.envOr("MINIMUM_PAYOUT_USD_1E18", uint256(0.5e18)));
        uint256 lowUsd = vm.envOr("LOW_WATERMARK_USD_1E18", uint256(10e18));

        vm.startBroadcast();
        oracleAddr = vm.envOr("ORACLE", address(0));
        PostedPriceOracle oracle = oracleAddr == address(0) ? new PostedPriceOracle(acl) : PostedPriceOracle(oracleAddr);
        oracleAddr = address(oracle);

        _register(vault, oracle, CASHCAT, vm.envOr("PRICE_CASHCAT_1E18", uint256(0)), staleness, minPayout, lowUsd);
        _register(vault, oracle, PONS, vm.envOr("PRICE_PONS_1E18", uint256(0)), staleness, minPayout, lowUsd);
        _register(vault, oracle, AI, vm.envOr("PRICE_AI_1E18", uint256(0)), staleness, minPayout, lowUsd);
        vm.stopBroadcast();
    }

    function _register(RewardVault vault, PostedPriceOracle oracle, address asset, uint256 seedPrice, uint32 staleness, uint128 minPayout, uint256 lowUsd) internal {
        // lowWatermark in base units: $lowUsd worth at the seed price (fallback: 100 tokens).
        uint128 low = seedPrice > 0 ? uint128((lowUsd * 1e18) / seedPrice) : uint128(100e18);
        vault.registerAsset(
            asset,
            RewardVault.AssetConfig({enabled: true, decimals: 18, maxStaleness: staleness, oracle: address(oracle), minimumPayoutUsd: minPayout, lowWatermark: low})
        );
        if (seedPrice > 0) oracle.forcePrice(asset, seedPrice, block.timestamp);
    }
}
