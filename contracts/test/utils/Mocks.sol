// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPriceOracle} from "../../src/interfaces/IPriceOracle.sol";
import {CasinoTreasury} from "../../src/CasinoTreasury.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockOracle is IPriceOracle {
    struct Quote {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(address => Quote) public quotes;
    bool public shouldRevert;

    function set(address asset, uint256 price, uint256 updatedAt) external {
        quotes[asset] = Quote(price, updatedAt);
    }

    function setRevert(bool v) external {
        shouldRevert = v;
    }

    function getPrice(address asset) external view returns (uint256, uint256) {
        if (shouldRevert) revert("oracle down");
        Quote memory q = quotes[asset];
        return (q.price, q.updatedAt);
    }
}

/// @dev Re-enters `withdraw()` from its receive hook. Also implements the ERC-1155 receiver so it can
///      hold chips after `deposit()`.
contract MaliciousReceiver {
    CasinoTreasury public immutable treasury;
    uint256 public reentered;
    bool public attack;

    constructor(CasinoTreasury t) {
        treasury = t;
    }

    function deposit() external payable {
        treasury.deposit{value: msg.value}();
    }

    function approveChips(address chip) external {
        (bool ok,) = chip.call(abi.encodeWithSignature("setApprovalForAll(address,bool)", address(treasury), true));
        require(ok);
    }

    function redeem(uint256[] calldata ids, uint256[] calldata amounts) external {
        treasury.redeem(ids, amounts);
    }

    function withdraw(bool attack_) external {
        attack = attack_;
        treasury.withdraw();
    }

    receive() external payable {
        if (attack) {
            ++reentered;
            // Must fail: ReentrancyGuard. Propagate so the outer call also fails.
            treasury.withdraw();
        }
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x4e2312e0 || id == 0x01ffc9a7;
    }
}
