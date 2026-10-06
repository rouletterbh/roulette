// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ScriptBase} from "./utils/ScriptBase.sol";
import {PostedPriceOracle} from "../src/PostedPriceOracle.sol";
import {RewardVault} from "../src/RewardVault.sol";

/// @title RegisterRbl
/// @notice Registers the project token RBL (Roblette) as a reward asset on an existing
///         RewardVault, priced by an existing PostedPriceOracle. Run as ADMIN. Mirrors
///         RegisterRewards.s.sol for a single asset. The operator relay (agent/operator,
///         source `pons-curve`) keeps the oracle fresh from RBL's Pons V2 launch curve;
///         the fulfilment command buys vault inventory on the same curve.
///
/// Required env:
///   VAULT                  RewardVault address
///   ORACLE                 PostedPriceOracle address (must already exist; nothing is deployed here)
/// Optional env:
///   PRICE_RBL_1E18         USD 1e18 per RBL. When > 0: sizes the low watermark as $LOW_WATERMARK_USD_1E18
///                          worth of RBL and seeds the oracle with `forcePrice` (first post or a deviation
///                          acknowledgement). When 0 (default): low watermark = 500_000 RBL and the oracle
///                          is left to the relay.
///   MAX_STALENESS          seconds, default 900 (15 minutes; the relay posts every 300 s)
///   MINIMUM_PAYOUT_USD_1E18 default 0.5e18
///   LOW_WATERMARK_USD_1E18 default 10e18
///
/// Funding inventory is not done here: `agent/operator` `bun run convert` buys RBL on its launch
/// curve with the ETH players earmark and calls `fundInventory`.
contract RegisterRbl is ScriptBase {
    /// @dev Roblette (RBL), 18 decimals, 1e9 supply, Robinhood Chain mainnet (chain 4663).
    address constant RBL = 0x041f48E1C2855be1287B94363f4f3D8585ceCCdc;

    function run() external returns (address oracleAddr) {
        RewardVault vault = RewardVault(vm.envAddress("VAULT"));
        PostedPriceOracle oracle = PostedPriceOracle(vm.envAddress("ORACLE"));
        oracleAddr = address(oracle);
        uint32 staleness = uint32(vm.envOr("MAX_STALENESS", uint256(900)));
        uint128 minPayout = uint128(vm.envOr("MINIMUM_PAYOUT_USD_1E18", uint256(0.5e18)));
        uint256 lowUsd = vm.envOr("LOW_WATERMARK_USD_1E18", uint256(10e18));
        uint256 seedPrice = vm.envOr("PRICE_RBL_1E18", uint256(0));

        // lowWatermark in base units: $lowUsd worth at the seed price; without a price, 500k RBL.
        uint128 low = seedPrice > 0 ? uint128((lowUsd * 1e18) / seedPrice) : uint128(500_000e18);

        vm.startBroadcast();
        vault.registerAsset(
            RBL,
            RewardVault.AssetConfig({enabled: true, decimals: 18, maxStaleness: staleness, oracle: oracleAddr, minimumPayoutUsd: minPayout, lowWatermark: low})
        );
        if (seedPrice > 0) oracle.forcePrice(RBL, seedPrice, block.timestamp);
        vm.stopBroadcast();
    }
}
