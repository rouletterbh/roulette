// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ScriptBase} from "./utils/ScriptBase.sol";
import {PostedPriceOracle} from "../src/PostedPriceOracle.sol";
import {RewardVault} from "../src/RewardVault.sol";

/// @title RegisterBlink
/// @notice Registers dont blink (BLINK), the dontblink launchpad token on Robinhood Chain, as a reward asset on the
///         RewardVault, priced by the existing PostedPriceOracle (fed by the relay from CoinGecko). Run as ADMIN.
///
/// Required env: VAULT, ORACLE
/// Optional env: MAX_STALENESS (900), MINIMUM_PAYOUT_USD_1E18 (0.5e18), LOW_WATERMARK_USD_1E18 (10e18),
///               PRICE_BLINK_1E18 (seed price; > 0 also calls forcePrice and sizes the low watermark)
contract RegisterBlink is ScriptBase {
    /// @dev dont blink (BLINK), 18 decimals, 1e9 supply, Robinhood Chain mainnet (chain 4663).
    address constant BLINK = 0x7b630F080807DF83908b4aDE46BA6396EE66b098;

    function run() external {
        RewardVault vault = RewardVault(vm.envAddress("VAULT"));
        PostedPriceOracle oracle = PostedPriceOracle(vm.envAddress("ORACLE"));
        uint32 staleness = uint32(vm.envOr("MAX_STALENESS", uint256(900)));
        uint128 minPayout = uint128(vm.envOr("MINIMUM_PAYOUT_USD_1E18", uint256(0.5e18)));
        uint256 lowUsd = vm.envOr("LOW_WATERMARK_USD_1E18", uint256(10e18));
        uint256 seedPrice = vm.envOr("PRICE_BLINK_1E18", uint256(0));

        // lowWatermark in base units: $lowUsd worth at the seed price; without a price, 25k BLINK (~$10 at $0.0004).
        uint128 low = seedPrice > 0 ? uint128((lowUsd * 1e18) / seedPrice) : uint128(25_000e18);

        vm.startBroadcast();
        vault.registerAsset(
            BLINK,
            RewardVault.AssetConfig({enabled: true, decimals: 18, maxStaleness: staleness, oracle: address(oracle), minimumPayoutUsd: minPayout, lowWatermark: low})
        );
        if (seedPrice > 0) oracle.forcePrice(BLINK, seedPrice, block.timestamp);
        vm.stopBroadcast();
    }
}
