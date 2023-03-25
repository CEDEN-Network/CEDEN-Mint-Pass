// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;
pragma abicoder v2;

import "@layerzerolabs/solidity-examples/contracts/mocks/LZEndpointMock.sol";

contract CedenLZEndpointMock is LZEndpointMock {
    constructor(uint16 _chainId) LZEndpointMock(_chainId) {}
}
