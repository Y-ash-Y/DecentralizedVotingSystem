// SPDX-License-Identifier: MPL-2.0
pragma solidity ^0.8.20;
import "../VotingV2.sol";

/// @notice LOCAL TEST FIXTURE ONLY. Not the public-network V2 deployment.
/// @dev Each interval must be positive; no hour/minute policy minimum applies.
contract VotingSystemLocalTest is VotingSystemV2 {
    constructor() { require(block.chainid == 31337, "Local test chain only"); }
    function minimumPhaseDuration() internal pure override returns (uint) { return 1; }
    function localTestMode() external pure returns (bool) { return true; }
}
