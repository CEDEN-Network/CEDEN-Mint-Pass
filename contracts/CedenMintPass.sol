// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@layerzerolabs/solidity-examples/contracts/token/onft/ONFT721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "operator-filter-registry/src/UpdatableOperatorFilterer.sol";
import "operator-filter-registry/src/RevokableDefaultOperatorFilterer.sol";

contract CedenMintPass is ONFT721, ERC2981, RevokableDefaultOperatorFilterer {
    using SafeERC20 for IERC20;

    mapping(address => uint) public freeMintList;
    mapping(address => uint) public allowList;
    mapping(address => uint) public openMint;
    IERC20 public immutable stableToken;
    bool public exclusiveWindow;
    uint public freeMintsLeft;
    uint public price;
    uint public nextMintId;
    uint immutable MAX_MINT_ID;
    address public feeCollectorAddress;
    string public baseTokenURI;

    constructor(string memory _name, string memory _symbol, uint256 _minGasToStore, address _layerZeroEndpoint, address _stableTokenAddress, uint _stableTokenDecimals,  address _feeCollectorAddress) ONFT721(_name, _symbol, _minGasToStore, _layerZeroEndpoint) {
        stableToken = IERC20(_stableTokenAddress);
        price = 500 * 10**_stableTokenDecimals;
        nextMintId = 0;
        MAX_MINT_ID = 4444;
        exclusiveWindow = true;
        feeCollectorAddress = _feeCollectorAddress;
        _setDefaultRoyalty(feeCollectorAddress, 269);
    }

    function mint(uint _quantity) external {
        //check if address has free mints left
        if(freeMintList[msg.sender] >= _quantity) {
            freeMintList[msg.sender] -= _quantity;
            freeMintsLeft -= _quantity;
        } else {
            // check if in exclusive time window
            // if so only allowed users can mint
            if(exclusiveWindow) {
                // check if address is in allowList
                require(allowList[msg.sender] >= _quantity, "Allow List amount < mint amount");
                allowList[msg.sender] -= _quantity;
            }
            // else free for all until mint out
            require(nextMintId + _quantity <= MAX_MINT_ID - freeMintsLeft, "Ceden: Mint exceeds supply");
            stableToken.safeTransferFrom(msg.sender, feeCollectorAddress, price * _quantity);
        }
        for(uint i; i < _quantity;) {
            _safeMint(msg.sender, ++nextMintId);
            unchecked{++i;}
        }
    }

    function addToFreeMintList(address _address, uint _amount) external onlyOwner {
        freeMintsLeft += _amount;
        freeMintList[_address] = _amount;
    }

    function addToAllowList(address _address, uint _amount) external onlyOwner {
        require(_amount <= 10, "Allow List mint range is 1-10");
        allowList[_address] = _amount;
    }

    function setMintPrice(uint _price) external onlyOwner {
        price = _price;
    }

    function setBaseURI(string memory _baseTokenURI) public onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    function setExclusiveWindow(bool _exclusiveWindow) public onlyOwner {
        exclusiveWindow = _exclusiveWindow;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ONFT721, ERC2981) returns (bool) {
        return ONFT721.supportsInterface(interfaceId) || ERC2981.supportsInterface(interfaceId);
    }

    function setApprovalForAll(address operator, bool approved)
        public
        override(ERC721, IERC721)
        onlyAllowedOperatorApproval(operator)
    {
        super.setApprovalForAll(operator, approved);
    }

    function approve(address operator, uint256 tokenId)
        public
        override(ERC721, IERC721)
        onlyAllowedOperatorApproval(operator)
    {
        super.approve(operator, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId)
        public
        override(ERC721, IERC721)
        onlyAllowedOperator(from)
    {
        super.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId)
        public
        override(ERC721, IERC721)
        onlyAllowedOperator(from)
    {
        super.safeTransferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data)
        public
        override(ERC721, IERC721)
        onlyAllowedOperator(from)
    {
        super.safeTransferFrom(from, to, tokenId, data);
    }

    function owner()
        public
        view
        override(Ownable, UpdatableOperatorFilterer)
        returns (address)
    {
        return Ownable.owner();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        return _baseURI();
    }
}
