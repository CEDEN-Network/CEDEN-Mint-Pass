// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@layerzerolabs/solidity-examples/contracts/mocks/MockToken.sol";


contract CedenMockToken is MockToken {
    constructor(string memory name_, string memory symbol_) MockToken(name_, symbol_) {}
}
