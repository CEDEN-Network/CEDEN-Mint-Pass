// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "../CedenMintPassV2.sol";

contract CedenMintPassMock is CedenMintPassV2 {
    // extra function needed for batch unit testing
    function rawOwnerOf(uint256 tokenId) public view returns (address) {
        if (_exists(tokenId)) {
            return ownerOf(tokenId);
        }
        return address(0);
    }
}
