// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title PlayerRegistry
/// @notice Minimal social layer: an optional display-name hash and a referral code mapping.
/// @dev No admin, no funds. Display names are stored as hashes (no PII onchain); the plaintext
///      lives offchain and is verified against the hash. Referral codes are one-time and
///      self-referral is impossible by construction.
contract PlayerRegistry {
    mapping(address player => bytes32) public displayNameHash;
    mapping(bytes32 code => address) public codeOwner;
    mapping(address player => bytes32) public codeOf;
    mapping(address player => address) public referrerOf;

    event DisplayNameSet(address indexed player, bytes32 nameHash);
    event ReferralCodeRegistered(address indexed player, bytes32 indexed code);
    event ReferrerSet(address indexed player, address indexed referrer, bytes32 indexed code);

    error ZeroCode();
    error CodeTaken(bytes32 code);
    error AlreadyHasCode(address player);
    error UnknownCode(bytes32 code);
    error SelfReferral();
    error ReferrerAlreadySet(address player);

    function setDisplayNameHash(bytes32 nameHash) external {
        displayNameHash[msg.sender] = nameHash;
        emit DisplayNameSet(msg.sender, nameHash);
    }

    /// @notice Claim a referral code (one per address, never reassigned).
    function registerReferralCode(bytes32 code) external {
        if (code == bytes32(0)) revert ZeroCode();
        if (codeOwner[code] != address(0)) revert CodeTaken(code);
        if (codeOf[msg.sender] != bytes32(0)) revert AlreadyHasCode(msg.sender);
        codeOwner[code] = msg.sender;
        codeOf[msg.sender] = code;
        emit ReferralCodeRegistered(msg.sender, code);
    }

    /// @notice Record who referred the caller. One-time; the referrer can never be the caller.
    function setReferrer(bytes32 code) external {
        address owner = codeOwner[code];
        if (owner == address(0)) revert UnknownCode(code);
        if (owner == msg.sender) revert SelfReferral();
        if (referrerOf[msg.sender] != address(0)) revert ReferrerAlreadySet(msg.sender);
        referrerOf[msg.sender] = owner;
        emit ReferrerSet(msg.sender, owner, code);
    }
}
