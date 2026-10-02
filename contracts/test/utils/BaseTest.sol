// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Minimal subset of Foundry's cheatcode interface. The address is the canonical
///      `keccak256("hevm cheat code")` that forge intercepts, so these calls work unchanged under
///      `forge test`. Only the cheatcodes used by this suite are declared.
interface Vm {
    function prank(address msgSender) external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function deal(address account, uint256 newBalance) external;
    function roll(uint256 newHeight) external;
    function warp(uint256 newTimestamp) external;
    function expectRevert() external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function label(address account, string calldata newLabel) external;
    function assume(bool condition) external pure;
}

/// @title BaseTest
/// @notice Tiny assertion base so the suite compiles with plain solc (no forge-std vendored).
/// @dev Switching to forge-std is a one-line change: `import {Test as BaseTest} from "forge-std/Test.sol";`
///      Assertions revert on failure, which forge reports as a failed test.
abstract contract BaseTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bool public IS_TEST = true;

    function fail(string memory reason) internal pure {
        revert(reason);
    }

    function assertTrue(bool cond) internal pure {
        if (!cond) revert("assertTrue failed");
    }

    function assertTrue(bool cond, string memory reason) internal pure {
        if (!cond) revert(reason);
    }

    function assertFalse(bool cond) internal pure {
        if (cond) revert("assertFalse failed");
    }

    function assertFalse(bool cond, string memory reason) internal pure {
        if (cond) revert(reason);
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        if (a != b) revert(string.concat("assertEq(uint) failed: ", _u(a), " != ", _u(b)));
    }

    function assertEq(uint256 a, uint256 b, string memory reason) internal pure {
        if (a != b) revert(string.concat(reason, ": ", _u(a), " != ", _u(b)));
    }

    function assertEq(address a, address b) internal pure {
        if (a != b) revert("assertEq(address) failed");
    }

    function assertEq(bytes32 a, bytes32 b) internal pure {
        if (a != b) revert("assertEq(bytes32) failed");
    }

    function assertEq(bool a, bool b) internal pure {
        if (a != b) revert("assertEq(bool) failed");
    }

    function assertGe(uint256 a, uint256 b) internal pure {
        if (a < b) revert(string.concat("assertGe failed: ", _u(a), " < ", _u(b)));
    }

    function assertGe(uint256 a, uint256 b, string memory reason) internal pure {
        if (a < b) revert(string.concat(reason, ": ", _u(a), " < ", _u(b)));
    }

    function assertLe(uint256 a, uint256 b) internal pure {
        if (a > b) revert(string.concat("assertLe failed: ", _u(a), " > ", _u(b)));
    }

    function assertLe(uint256 a, uint256 b, string memory reason) internal pure {
        if (a > b) revert(string.concat(reason, ": ", _u(a), " > ", _u(b)));
    }

    function assertGt(uint256 a, uint256 b) internal pure {
        if (a <= b) revert(string.concat("assertGt failed: ", _u(a), " <= ", _u(b)));
    }

    function assertGt(uint256 a, uint256 b, string memory reason) internal pure {
        if (a <= b) revert(string.concat(reason, ": ", _u(a), " <= ", _u(b)));
    }

    function assertLt(uint256 a, uint256 b) internal pure {
        if (a >= b) revert(string.concat("assertLt failed: ", _u(a), " >= ", _u(b)));
    }

    function assertLt(uint256 a, uint256 b, string memory reason) internal pure {
        if (a >= b) revert(string.concat(reason, ": ", _u(a), " >= ", _u(b)));
    }

    /// @dev Reverts if `data` (revert payload) does not start with `selector`.
    function assertRevertSelector(bytes memory data, bytes4 selector) internal pure {
        if (data.length < 4) revert("revert payload too short");
        bytes4 got;
        assembly {
            got := mload(add(data, 32))
        }
        if (got != selector) revert("unexpected revert selector");
    }

    function _u(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) ++len;
        bytes memory out = new bytes(len);
        while (v != 0) {
            out[--len] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(out);
    }
}

/// @title InvariantBase
/// @notice Mirrors the forge `StdInvariant` target-selection surface used by `forge test --match-path '*invariants*'`.
abstract contract InvariantBase is BaseTest {
    address[] private _targetContracts;

    function targetContract(address target) internal {
        _targetContracts.push(target);
    }

    function targetContracts() public view returns (address[] memory) {
        return _targetContracts;
    }
}
