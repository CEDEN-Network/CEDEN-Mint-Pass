const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const Web3 = require("web3");
const web3 = new Web3();

describe("CedenMintPass: ", function () {
  const chainId_A = 1;
  const chainId_B = 2;
  const name = "CedenMintPass";
  const symbol = "CMP";
  const batchSizeLimit = 300;
  const minGasToStore = 150000;
  const defaultAdapterParams = ethers.utils.solidityPack(
    ["uint16", "uint256"],
    [1, 200000]
  );

  let owner,
    warlock,
    lzEndpointMockA,
    lzEndpointMockB,
    LZEndpointMock,
    ONFT,
    ONFT_A,
    ONFT_B,
    MockToken,
    usdcTokenA,
    usdcTokenB;

  before(async function () {
    owner = (await ethers.getSigners())[0];
    warlock = (await ethers.getSigners())[1];
    LZEndpointMock = await ethers.getContractFactory("CedenLZEndpointMock");
    ONFT = await ethers.getContractFactory("CedenMintPassMock");
    MockToken = await ethers.getContractFactory("CedenMockToken");
  });

  beforeEach(async function () {
    lzEndpointMockA = await LZEndpointMock.deploy(chainId_A);
    lzEndpointMockB = await LZEndpointMock.deploy(chainId_B);

    usdcTokenA = await MockToken.deploy("USDC", "USDC");
    usdcTokenB = await MockToken.deploy("USDC", "USDC");

    // generate a proxy to allow it to go ONFT
    ONFT_A = await upgrades.deployProxy(
      ONFT,
      [
        name,
        symbol,
        minGasToStore,
        lzEndpointMockA.address,
        usdcTokenA.address,
        8,
        warlock.address,
      ],
      { initializer: "initialize" }
    );
    ONFT_B = await upgrades.deployProxy(
      ONFT,
      [
        name,
        symbol,
        minGasToStore,
        lzEndpointMockB.address,
        usdcTokenB.address,
        8,
        warlock.address,
      ],
      { initializer: "initialize" }
    );

    // wire the lz endpoints to guide msgs back and forth
    lzEndpointMockA.setDestLzEndpoint(ONFT_B.address, lzEndpointMockB.address);
    lzEndpointMockB.setDestLzEndpoint(ONFT_A.address, lzEndpointMockA.address);

    // set each contracts source address so it can send to each other
    await ONFT_A.setTrustedRemote(
      chainId_B,
      ethers.utils.solidityPack(
        ["address", "address"],
        [ONFT_B.address, ONFT_A.address]
      )
    );
    await ONFT_B.setTrustedRemote(
      chainId_A,
      ethers.utils.solidityPack(
        ["address", "address"],
        [ONFT_A.address, ONFT_B.address]
      )
    );

    // // set batch size limit
    await ONFT_A.setDstChainIdToBatchLimit(chainId_B, batchSizeLimit);
    await ONFT_B.setDstChainIdToBatchLimit(chainId_A, batchSizeLimit);

    // // set min dst gas for swap
    await ONFT_A.setMinDstGas(chainId_B, 1, 150000);
    await ONFT_B.setMinDstGas(chainId_A, 1, 150000);
  });

  it("mint() - try when not on free list or allow list during exclusiveWindow", async function () {
    await expect(ONFT_A.mint(1)).to.be.revertedWith(
      "Allow List amount < mint amount"
    );
  });

  it("mint() - when on the free list should not have to pay", async function () {
    await ONFT_A.addToFreeMintList(owner.address, 1);
    await ONFT_A.mint(1);
    expect(await ONFT_A.ownerOf(1)).to.be.equal(owner.address);

    await expect(ONFT_A.mint(1)).to.be.revertedWith(
      "Allow List amount < mint amount"
    );
  });

  it("mint() - when window opens up anyone can mint but must save for free minters", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);

    await ONFT_A.setExclusiveWindow(false);

    // other user tries to mint out the supply buy fails bc its saving one for free minter
    await expect(ONFT_A.connect(warlock).mint(10000)).to.be.revertedWith(
      "Ceden: Mint exceeds supply"
    );

    let price = await ONFT_A.price();
    let mintQuantity = 5;
    let totalAllowance = price * mintQuantity;
    await usdcTokenA.transfer(warlock.address, totalAllowance);
    await usdcTokenA.connect(warlock).approve(ONFT_A.address, totalAllowance);

    await ONFT_A.connect(warlock).mint(mintQuantity);
    expect(await ONFT_A.ownerOf(1)).to.be.equal(warlock.address);
    expect(await ONFT_A.ownerOf(2)).to.be.equal(warlock.address);
    expect(await ONFT_A.ownerOf(3)).to.be.equal(warlock.address);
    expect(await ONFT_A.ownerOf(4)).to.be.equal(warlock.address);
    expect(await ONFT_A.ownerOf(5)).to.be.equal(warlock.address);

    await ONFT_A.mint(1);
    expect(await ONFT_A.ownerOf(6)).to.be.equal(owner.address);
  });

  it("sendFrom() - your own tokens", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);

    const tokenId = 1;
    await ONFT_A.mint(1);

    // verify the owner of the token is on the source chain
    expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(owner.address);

    // token doesn't exist on other chain
    await expect(ONFT_B.ownerOf(tokenId)).to.be.revertedWith(
      "ERC721: invalid token ID"
    );

    // can transfer token on srcChain as regular erC721
    await ONFT_A.transferFrom(owner.address, warlock.address, tokenId);
    expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(warlock.address);

    // approve the proxy to swap your token
    await ONFT_A.connect(warlock).approve(ONFT_A.address, tokenId);

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendFee(
        chainId_B,
        warlock.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // swaps token to other chain
    await ONFT_A.connect(warlock).sendFrom(
      warlock.address,
      chainId_B,
      warlock.address,
      tokenId,
      warlock.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      { value: nativeFee }
    );

    // token is burnt
    expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(ONFT_A.address);

    // token received on the dst chain
    expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(warlock.address);

    // estimate nativeFees
    nativeFee = (
      await ONFT_B.estimateSendFee(
        chainId_A,
        warlock.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // can send to other onft contract eg. not the original nft contract chain
    await ONFT_B.connect(warlock).sendFrom(
      warlock.address,
      chainId_A,
      warlock.address,
      tokenId,
      warlock.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      { value: nativeFee }
    );

    // token is burned on the sending chain
    expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(ONFT_B.address);
  });

  it("sendFrom() - reverts if not owner on non proxy chain", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);
    const tokenId = 1;
    await ONFT_A.mint(1);

    // approve the proxy to swap your token
    await ONFT_A.approve(ONFT_A.address, tokenId);

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendFee(
        chainId_B,
        owner.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // swaps token to other chain
    await ONFT_A.sendFrom(
      owner.address,
      chainId_B,
      owner.address,
      tokenId,
      owner.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      {
        value: nativeFee,
      }
    );

    // token received on the dst chain
    expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address);

    // reverts because other address does not own it
    await expect(
      ONFT_B.connect(warlock).sendFrom(
        warlock.address,
        chainId_A,
        warlock.address,
        tokenId,
        warlock.address,
        ethers.constants.AddressZero,
        defaultAdapterParams
      )
    ).to.be.revertedWith("ONFT721: send caller is not owner nor approved");
  });

  it("sendFrom() - on behalf of other user", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);
    const tokenId = 1;
    await ONFT_A.mint(1);

    // approve the proxy to swap your token
    await ONFT_A.approve(ONFT_A.address, tokenId);

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendFee(
        chainId_B,
        owner.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // swaps token to other chain
    await ONFT_A.sendFrom(
      owner.address,
      chainId_B,
      owner.address,
      tokenId,
      owner.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      {
        value: nativeFee,
      }
    );

    // token received on the dst chain
    expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address);

    // approve the other user to send the token
    await ONFT_B.approve(warlock.address, tokenId);

    // estimate nativeFees
    nativeFee = (
      await ONFT_B.estimateSendFee(
        chainId_A,
        warlock.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // sends across
    await ONFT_B.connect(warlock).sendFrom(
      owner.address,
      chainId_A,
      warlock.address,
      tokenId,
      warlock.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      { value: nativeFee }
    );

    // token received on the dst chain
    expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(warlock.address);
  });

  it("sendFrom() - reverts if contract is approved, but not the sending user", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);

    const tokenId = 1;
    await ONFT_A.mint(1);

    // approve the proxy to swap your token
    await ONFT_A.approve(ONFT_A.address, tokenId);

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendFee(
        chainId_B,
        owner.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // swaps token to other chain
    await ONFT_A.sendFrom(
      owner.address,
      chainId_B,
      owner.address,
      tokenId,
      owner.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      {
        value: nativeFee,
      }
    );

    // token received on the dst chain
    expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address);

    // approve the contract to swap your token
    await ONFT_B.approve(ONFT_B.address, tokenId);

    // reverts because contract is approved, not the user
    await expect(
      ONFT_B.connect(warlock).sendFrom(
        owner.address,
        chainId_A,
        warlock.address,
        tokenId,
        warlock.address,
        ethers.constants.AddressZero,
        defaultAdapterParams
      )
    ).to.be.revertedWith("ONFT721: send caller is not owner nor approved");
  });

  it("sendFrom() - reverts if not approved on non proxy chain", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);

    const tokenId = 1;
    await ONFT_A.mint(1);

    // approve the proxy to swap your token
    await ONFT_A.approve(ONFT_A.address, tokenId);

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendFee(
        chainId_B,
        owner.address,
        tokenId,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // swaps token to other chain
    await ONFT_A.sendFrom(
      owner.address,
      chainId_B,
      owner.address,
      tokenId,
      owner.address,
      ethers.constants.AddressZero,
      defaultAdapterParams,
      {
        value: nativeFee,
      }
    );

    // token received on the dst chain
    expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address);

    // reverts because user is not approved
    await expect(
      ONFT_B.connect(warlock).sendFrom(
        owner.address,
        chainId_A,
        warlock.address,
        tokenId,
        warlock.address,
        ethers.constants.AddressZero,
        defaultAdapterParams
      )
    ).to.be.revertedWith("ONFT721: send caller is not owner nor approved");
  });

  it("sendFrom() - reverts if sender does not own token", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(owner.address, 1);

    // free minter gets 1
    await ONFT_A.addToFreeMintList(warlock.address, 1);

    const tokenIdA = 1;
    const tokenIdB = 2;
    // mint to both owners
    await ONFT_A.mint(1);
    await ONFT_A.connect(warlock).mint(1);

    // approve owner.address to transfer, but not the other
    await ONFT_A.setApprovalForAll(ONFT_A.address, true);

    await expect(
      ONFT_A.connect(warlock).sendFrom(
        warlock.address,
        chainId_B,
        warlock.address,
        tokenIdA,
        warlock.address,
        ethers.constants.AddressZero,
        defaultAdapterParams
      )
    ).to.be.revertedWith("ONFT721: send caller is not owner nor approved");
    await expect(
      ONFT_A.connect(warlock).sendFrom(
        warlock.address,
        chainId_B,
        owner.address,
        tokenIdA,
        owner.address,
        ethers.constants.AddressZero,
        defaultAdapterParams
      )
    ).to.be.revertedWith("ONFT721: send caller is not owner nor approved");
  });

  it("sendBatchFrom()", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(warlock.address, 10);

    await ONFT_A.setMinGasToTransferAndStore(400000);
    await ONFT_B.setMinGasToTransferAndStore(400000);

    const tokenIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // mint to owner
    await ONFT_A.connect(warlock).mint(10);

    // approve owner.address to transfer
    await ONFT_A.connect(warlock).setApprovalForAll(ONFT_A.address, true);

    const payload = ethers.utils.defaultAbiCoder.encode(
      ["bytes", "uint[]"],
      [warlock.address, tokenIds]
    );
    const hashedPayload = web3.utils.keccak256(payload);

    let adapterParams = ethers.utils.solidityPack(
      ["uint16", "uint256"],
      [1, 200000]
    );

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendBatchFee(
        chainId_B,
        warlock.address,
        tokenIds,
        false,
        defaultAdapterParams
      )
    ).nativeFee;

    // initiate batch transfer
    await expect(
      ONFT_A.connect(warlock).sendBatchFrom(
        warlock.address,
        chainId_B,
        warlock.address,
        tokenIds,
        warlock.address,
        ethers.constants.AddressZero,
        adapterParams,
        { value: nativeFee }
      )
    )
      .to.emit(ONFT_B, "CreditStored")
      .withArgs(hashedPayload, payload);

    // only partial amount of tokens has been sent, the rest have been stored as a credit
    let creditedIdsA = [];
    for (let tokenId of tokenIds) {
      let owner = await ONFT_B.rawOwnerOf(tokenId);
      if (owner == ethers.constants.AddressZero) {
        creditedIdsA.push(tokenId);
      } else {
        expect(owner).to.be.equal(warlock.address);
      }
    }

    // clear the rest of the credits
    await expect(ONFT_B.clearCredits(payload))
      .to.emit(ONFT_B, "CreditCleared")
      .withArgs(hashedPayload);

    let creditedIdsB = [];
    for (let tokenId of creditedIdsA) {
      let owner = await ONFT_B.rawOwnerOf(tokenId);
      if (owner == ethers.constants.AddressZero) {
        creditedIdsB.push(tokenId);
      } else {
        expect(owner).to.be.equal(warlock.address);
      }
    }

    // all ids should have cleared
    expect(creditedIdsB.length).to.be.equal(0);

    // should revert because payload is no longer valid
    await expect(ONFT_B.clearCredits(payload)).to.be.revertedWith(
      "ONFT721: no credits stored"
    );
  });

  it("sendBatchFrom() - large batch", async function () {
    // free minter gets 1
    await ONFT_A.addToFreeMintList(warlock.address, 300);

    await ONFT_A.setMinGasToTransferAndStore(400000);
    await ONFT_B.setMinGasToTransferAndStore(400000);

    const tokenIds = [];

    for (let i = 1; i <= 300; i++) {
      tokenIds.push(i);
    }

    // mint to owner
    await ONFT_A.connect(warlock).mint(300);

    // approve owner.address to transfer
    await ONFT_A.connect(warlock).setApprovalForAll(ONFT_A.address, true);

    // expected event params
    const payload = ethers.utils.defaultAbiCoder.encode(
      ["bytes", "uint[]"],
      [warlock.address, tokenIds]
    );
    const hashedPayload = web3.utils.keccak256(payload);

    let adapterParams = ethers.utils.solidityPack(
      ["uint16", "uint256"],
      [1, 400000]
    );

    // estimate nativeFees
    let nativeFee = (
      await ONFT_A.estimateSendBatchFee(
        chainId_B,
        warlock.address,
        tokenIds,
        false,
        adapterParams
      )
    ).nativeFee;

    // initiate batch transfer
    await expect(
      ONFT_A.connect(warlock).sendBatchFrom(
        warlock.address,
        chainId_B,
        warlock.address,
        tokenIds,
        warlock.address,
        ethers.constants.AddressZero,
        adapterParams,
        { value: nativeFee }
      )
    )
      .to.emit(ONFT_B, "CreditStored")
      .withArgs(hashedPayload, payload);

    // only partial amount of tokens has been sent, the rest have been stored as a credit
    let creditedIdsA = [];
    for (let tokenId of tokenIds) {
      let owner = await ONFT_B.rawOwnerOf(tokenId);
      if (owner == ethers.constants.AddressZero) {
        creditedIdsA.push(tokenId);
      } else {
        expect(owner).to.be.equal(warlock.address);
      }
    }

    // console.log("Number of tokens credited: ", creditedIdsA.length)

    // clear the rest of the credits
    let tx = await (await ONFT_B.clearCredits(payload)).wait();

    // console.log("Total gasUsed: ", tx.gasUsed.toString())

    let creditedIdsB = [];
    for (let tokenId of creditedIdsA) {
      let owner = await ONFT_B.rawOwnerOf(tokenId);
      if (owner == ethers.constants.AddressZero) {
        creditedIdsB.push(tokenId);
      } else {
        expect(owner).to.be.equal(warlock.address);
      }
    }

    // console.log("Number of tokens credited: ", creditedIdsB.length)

    // all ids should have cleared
    expect(creditedIdsB.length).to.be.equal(0);

    // should revert because payload is no longer valid
    await expect(ONFT_B.clearCredits(payload)).to.be.revertedWith(
      "ONFT721: no credits stored"
    );
  });
});
