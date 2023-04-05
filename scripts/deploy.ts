import { ethers, upgrades } from "hardhat";

async function main() {
  const CedenMintPassV1 = await ethers.getContractFactory("CedenMintPassV1");
  const cedenMintPassV1 = await upgrades.deployProxy(CedenMintPassV1, [
    "CEDEN Mint Pass",
    "CMP",
    150000,
    "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675", // lz endpoint
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // usdc
    6,
    "0x93E716Bb3F1CC5c37d07AD6CD10c2681447AF880", // fee receiver
  ],
    { initializer: 'initialize' },
  );
  await cedenMintPassV1.deployed();

  console.log("CedenMintPassV1 deployed to:", cedenMintPassV1.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
