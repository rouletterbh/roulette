// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {RoleGated} from "./RoleGated.sol";
import {Roles} from "./Roles.sol";
import {IChip1155} from "./interfaces/IChip1155.sol";

/// @title Chip1155
/// @notice ERC-1155 casino chips in six denominations. Supply-tracked so the treasury can
///         compute outstanding chip liability in O(1) per denomination.
/// @dev Token id = 1000 + unit value: 1001, 1005, 1010, 1025, 1050, 1100.
///      Only the MINTER role (held exclusively by {CasinoTreasury}) can mint or burn; burning
///      additionally requires the token owner to have approved the caller (standard ERC-1155
///      semantics), so the treasury can never burn chips a player did not consent to.
contract Chip1155 is ERC1155, ERC1155Supply, RoleGated, IChip1155 {
    uint256 public constant ID_OFFSET = 1000;
    uint256 public constant DENOMINATION_COUNT = 6;

    error InvalidChipId(uint256 id);
    error LengthMismatch();
    error NotOwnerNorApproved(address from, address operator);
    error ZeroUnits();

    event TokenURISet(uint256 indexed id, string uri);
    event BaseURISet(string uri);

    mapping(uint256 id => string) private _tokenURIs;

    constructor(address acl_, string memory baseUri) ERC1155(baseUri) RoleGated(acl_) {}

    // ----------------------------------------------------------------- views

    /// @inheritdoc IChip1155
    function valueOf(uint256 id) public pure returns (uint256) {
        if (id <= ID_OFFSET) revert InvalidChipId(id);
        uint256 v = id - ID_OFFSET;
        if (v == 1 || v == 5 || v == 10 || v == 25 || v == 50 || v == 100) return v;
        revert InvalidChipId(id);
    }

    /// @inheritdoc IChip1155
    function totalValue(uint256[] calldata ids, uint256[] calldata amounts) public pure returns (uint256 total) {
        if (ids.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) {
            total += valueOf(ids[i]) * amounts[i];
        }
    }

    /// @notice Denomination unit values, largest first.
    function denominations() public pure returns (uint256[DENOMINATION_COUNT] memory d) {
        d = [uint256(100), 50, 25, 10, 5, 1];
    }

    /// @inheritdoc IChip1155
    function totalUnits() public view returns (uint256 units) {
        uint256[DENOMINATION_COUNT] memory d = denominations();
        for (uint256 i; i < DENOMINATION_COUNT; ++i) {
            units += totalSupply(ID_OFFSET + d[i]) * d[i];
        }
    }

    function uri(uint256 id) public view override returns (string memory) {
        string memory custom = _tokenURIs[id];
        return bytes(custom).length != 0 ? custom : super.uri(id);
    }

    // ---------------------------------------------------------------- minter

    /// @inheritdoc IChip1155
    function mintValue(address to, uint256 units)
        external
        onlyRole(Roles.MINTER_ROLE)
        returns (uint256[] memory ids, uint256[] memory amounts)
    {
        if (units == 0) revert ZeroUnits();
        uint256[DENOMINATION_COUNT] memory d = denominations();
        uint256[] memory tmpIds = new uint256[](DENOMINATION_COUNT);
        uint256[] memory tmpAmts = new uint256[](DENOMINATION_COUNT);
        uint256 n;
        uint256 rem = units;
        for (uint256 i; i < DENOMINATION_COUNT; ++i) {
            uint256 count = rem / d[i];
            if (count != 0) {
                tmpIds[n] = ID_OFFSET + d[i];
                tmpAmts[n] = count;
                ++n;
                rem -= count * d[i];
            }
        }
        ids = new uint256[](n);
        amounts = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = tmpIds[i];
            amounts[i] = tmpAmts[i];
        }
        _mintBatch(to, ids, amounts, "");
    }

    /// @inheritdoc IChip1155
    function batchMint(address to, uint256[] calldata ids, uint256[] calldata amounts)
        external
        onlyRole(Roles.MINTER_ROLE)
    {
        if (ids.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) valueOf(ids[i]);
        _mintBatch(to, ids, amounts, "");
    }

    /// @inheritdoc IChip1155
    function batchBurn(address from, uint256[] calldata ids, uint256[] calldata amounts)
        external
        onlyRole(Roles.MINTER_ROLE)
        returns (uint256 units)
    {
        if (from != msg.sender && !isApprovedForAll(from, msg.sender)) revert NotOwnerNorApproved(from, msg.sender);
        units = totalValue(ids, amounts);
        if (units == 0) revert ZeroUnits();
        _burnBatch(from, ids, amounts);
    }

    // ----------------------------------------------------------------- admin

    function setTokenURI(uint256 id, string calldata newUri) external onlyRole(Roles.ADMIN_ROLE) {
        valueOf(id);
        _tokenURIs[id] = newUri;
        emit TokenURISet(id, newUri);
    }

    function setBaseURI(string calldata newUri) external onlyRole(Roles.ADMIN_ROLE) {
        _setURI(newUri);
        emit BaseURISet(newUri);
    }

    // ------------------------------------------------------------- overrides

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, IERC165) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
