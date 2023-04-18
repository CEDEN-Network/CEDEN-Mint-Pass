import { ethers, upgrades } from "hardhat";

async function main() {
  const CedenMintPassV2 = await ethers.getContractFactory("CedenMintPassV2");
  const cedenMintPassV2 = await upgrades.upgradeProxy("0x4350F31B3AaAA1dCf16c2fF18DB4E2F718f50D6D", CedenMintPassV2);
  await cedenMintPassV2.deployed();

  console.log("CedenMintPassV2 upgraded");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
