// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @title IChip1155
/// @notice ERC-1155 casino chips. Token id = 1000 + denomination (1001 = 1 unit ... 1100 = 100 units).
interface IChip1155 is IERC1155 {
    /// @notice Unit value of a chip id. Reverts for unknown ids.
    function valueOf(uint256 id) external pure returns (uint256);

    /// @notice Sum of `amounts[i] * valueOf(ids[i])`.
    function totalValue(uint256[] calldata ids, uint256[] calldata amounts) external pure returns (uint256);

    /// @notice Mints `units` worth of chips to `to` using a greedy largest-denomination decomposition.
    function mintValue(address to, uint256 units) external returns (uint256[] memory ids, uint256[] memory amounts);

    /// @notice Mints explicit denominations (MINTER only).
    function batchMint(address to, uint256[] calldata ids, uint256[] calldata amounts) external;

    /// @notice Burns explicit denominations from `from` (MINTER only, `from` must have approved the caller).
    /// @return units Unit value burned.
    function batchBurn(address from, uint256[] calldata ids, uint256[] calldata amounts) external returns (uint256 units);

    /// @notice Total chip units outstanding across all denominations.
    function totalUnits() external view returns (uint256);
}
