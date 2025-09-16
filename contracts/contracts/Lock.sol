// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Lock is ReentrancyGuard {
    uint public immutable unlockTime;
    address payable public immutable owner;

    event Withdrawal(uint amount, uint when);

    constructor(uint _unlockTime) payable {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );
        require(_unlockTime <= block.timestamp + 365 days, "Unlock time too far");
        require(msg.sender != address(0), "Zero address");

        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }

    function withdraw() public nonReentrant {
        // Uncomment this line, and the import of "hardhat/console.sol", to print a log in your terminal
        // console.log("Unlock time is %o and block timestamp is %o", unlockTime, block.timestamp);

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");

        uint256 amount = address(this).balance;
        require(amount > 0, "No balance");
        
        emit Withdrawal(amount, block.timestamp);

        (bool ok, ) = owner.call{ value: amount }("");
        require(ok, "ETH xfer failed");
    }
}
