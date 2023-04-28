import { ethers, upgrades } from "hardhat";
import { expect } from "chai";

describe("CedenMintPassV2", () => {
  it("should upgrade from V1", async () => {
    const [owner] = await ethers.getSigners();

    const LZEndpointMock = await ethers.getContractFactory(
      "CedenLZEndpointMock"
    );
    const lzEndpointMock = await LZEndpointMock.deploy(1);
    await lzEndpointMock.deployed();

    const MockTocken = await ethers.getContractFactory("CedenMockToken");
    const mockToken = await MockTocken.deploy("Mock Token", "MTK");
    await mockToken.deployed();

    const CedenMintPassV1 = await ethers.getContractFactory("CedenMintPassV1");
    const cedenMintPassV1 = await upgrades.deployProxy(
      CedenMintPassV1,
      [
        "CEDEN Mint Pass",
        "CMP",
        150000,
        lzEndpointMock.address,
        mockToken.address,
        8,
        owner.address,
      ],
      { initializer: "initialize" }
    );
    await cedenMintPassV1.deployed();
    const maxMintIdV1 = await cedenMintPassV1.MAX_MINT_ID();

    const CedenMintPassV2 = await ethers.getContractFactory("CedenMintPassV2");
    const cedenMintPassV2 = await upgrades.upgradeProxy(
      cedenMintPassV1.address,
      CedenMintPassV2
    );
    await cedenMintPassV2.deployed();
    const maxMintIdV2 = await cedenMintPassV2.maxMintId();

    expect(maxMintIdV2).to.equal(maxMintIdV1);
  });
});
