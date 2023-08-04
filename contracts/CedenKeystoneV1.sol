// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@layerzerolabs/solidity-examples/contracts/contracts-upgradable/token/onft/ERC721/ONFT721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "operator-filter-registry/src/upgradeable/RevokableDefaultOperatorFiltererUpgradeable.sol";
import "./claimers/interfaces/ICedenClaimable.sol";

contract CedenKeystoneV1 is
    Initializable,
    ONFT721Upgradeable,
    ERC2981Upgradeable,
    RevokableDefaultOperatorFiltererUpgradeable,
    PausableUpgradeable,
    ICedenClaimable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string public baseTokenURI;
    mapping(address => uint) public freeMintList;
    mapping(address => uint) public allowList;
    IERC20Upgradeable public stableToken;
    address public feeCollectorAddress;
    address public claimerAddress;
    bool public exclusiveWindow;
    uint256 public freeMintsLeft;
    uint256 public price;
    uint256 public nextMintId;
    uint256 public maxMintId;

    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _minGasToStore,
        address _layerZeroEndpoint,
        address _stableTokenAddress,
        uint256 _stableTokenDecimals,
        address _feeCollectorAddress,
        address _claimerAddress
    ) public initializer {
        __ONFT721Upgradeable_init(_name, _symbol, _minGasToStore, _layerZeroEndpoint);
        __ERC2981_init();
        __RevokableDefaultOperatorFilterer_init();
        __Ownable_init();
        __Pausable_init();
        stableToken = IERC20Upgradeable(_stableTokenAddress);
        feeCollectorAddress = _feeCollectorAddress;
        claimerAddress = _claimerAddress;
        exclusiveWindow = true;
        price = 500 * 10 ** _stableTokenDecimals;
        nextMintId = 3333;
        maxMintId = 10000;
        _setDefaultRoyalty(feeCollectorAddress, 269);
        _pause();
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ONFT721Upgradeable, ERC2981Upgradeable) returns (bool) {
        return ONFT721Upgradeable.supportsInterface(interfaceId) || ERC2981Upgradeable.supportsInterface(interfaceId);
    }

    function owner() public view override(OwnableUpgradeable, RevokableOperatorFiltererUpgradeable) returns (address) {
        return OwnableUpgradeable.owner();
    }

    function setApprovalForAll(
        address operator,
        bool approved
    ) public override(ERC721Upgradeable, IERC721Upgradeable) onlyAllowedOperatorApproval(operator) whenNotPaused {
        super.setApprovalForAll(operator, approved);
    }

    function approve(
        address operator,
        uint256 tokenId
    ) public override(ERC721Upgradeable, IERC721Upgradeable) onlyAllowedOperatorApproval(operator) whenNotPaused {
        super.approve(operator, tokenId);
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override(ERC721Upgradeable, IERC721Upgradeable) onlyAllowedOperator(from) whenNotPaused {
        super.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override(ERC721Upgradeable, IERC721Upgradeable) onlyAllowedOperator(from) whenNotPaused {
        super.safeTransferFrom(from, to, tokenId);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public override(ERC721Upgradeable, IERC721Upgradeable) onlyAllowedOperator(from) whenNotPaused {
        super.safeTransferFrom(from, to, tokenId, data);
    }

    function mint(uint256 _quantity) external whenNotPaused {
        //check if address has free mints left
        if (freeMintList[msg.sender] >= _quantity) {
            freeMintList[msg.sender] -= _quantity;
            freeMintsLeft -= _quantity;
        } else {
            // check if in exclusive time window
            // if so only allowed users can mint
            if (exclusiveWindow) {
                // check if address is in allowList
                require(allowList[msg.sender] >= _quantity, "CedenKeystone: Allow List amount < mint amount");
                allowList[msg.sender] -= _quantity;
            }
            // else free for all until mint out
            require(nextMintId + _quantity <= maxMintId - freeMintsLeft, "CedenKeystone: Mint exceeds supply");
            stableToken.safeTransferFrom(msg.sender, feeCollectorAddress, price * _quantity);
        }
        for (uint256 i = 0; i < _quantity; ) {
            _safeMint(msg.sender, ++nextMintId);
            unchecked {
                ++i;
            }
        }
    }

    function claim(address _receiver, uint256[] memory _tokenIds) external whenNotPaused {
        require(msg.sender == claimerAddress, "CedenKeystone: Only claimer can mint with pass");
        for (uint256 i = 0; i < _tokenIds.length; ) {
            _safeMint(_receiver, _tokenIds[i]);
            unchecked {
                ++i;
            }
        }
    }

    function addToFreeMintList(address _address, uint256 _amount) external onlyOwner {
        freeMintsLeft += _amount;
        freeMintList[_address] = _amount;
    }

    function removeFromFreeMintList(address _address) external onlyOwner {
        freeMintsLeft -= freeMintList[_address];
        delete freeMintList[_address];
    }

    function addToAllowList(address _address, uint256 _amount) external onlyOwner {
        require(_amount <= 10, "CedenKeystone: Allow List mint range is 1-10");
        allowList[_address] = _amount;
    }

    function setExclusiveWindow(bool _exclusiveWindow) external onlyOwner {
        exclusiveWindow = _exclusiveWindow;
    }

    function setMintPrice(uint256 _price) external onlyOwner {
        price = _price;
    }

    function setBaseURI(string memory _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    function setMaxMintId(uint256 _maxMintId) external onlyOwner {
        maxMintId = _maxMintId;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    uint256[50] private __gap;
}
