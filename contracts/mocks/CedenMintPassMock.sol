// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "../CedenMintPass.sol";

contract CedenMintPassMock is CedenMintPass {
    // extra function needed for batch unit testing
    function rawOwnerOf(uint256 tokenId) public view returns (address) {
        if(_exists(tokenId)) {
            return ownerOf(tokenId);
        }
        return address(0);
    }
}
