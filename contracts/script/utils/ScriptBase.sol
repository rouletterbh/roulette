// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Subset of Foundry's script cheatcodes. Same cheat address forge intercepts, so `forge script`
///      runs this unchanged. Swap for `import {Script} from "forge-std/Script.sol";` once forge-std is
///      installed (`forge install foundry-rs/forge-std`).
interface VmScript {
    function startBroadcast() external;
    function startBroadcast(address broadcaster) external;
    function stopBroadcast() external;
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function envOr(string calldata name, bool defaultValue) external view returns (bool);
}

abstract contract ScriptBase {
    VmScript internal constant vm = VmScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    bool public IS_SCRIPT = true;

    /// @dev Emitted for every deployed contract so addresses show in `forge script` traces/logs.
    event Deployed(string name, address addr);
}
