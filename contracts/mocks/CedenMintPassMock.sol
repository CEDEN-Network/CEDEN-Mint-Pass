// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "../CedenMintPass.sol";

contract CedenMintPassMock is CedenMintPass {
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _minGasToStore,
        address _layerZeroEndpoint,
        address _stableTokenAddress,
        uint _stableTokenDecimals,
        address _feeCollectorAddress
    ) CedenMintPass(_name, _symbol, _minGasToStore, _layerZeroEndpoint, _stableTokenAddress, _stableTokenDecimals, _feeCollectorAddress) {}

    // extra function needed for batch unit testing
    function rawOwnerOf(uint256 tokenId) public view returns (address) {
        if(_exists(tokenId)) {
            return ownerOf(tokenId);
        }
        return address(0);
    }
}
