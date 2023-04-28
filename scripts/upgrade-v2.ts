import { ethers, upgrades } from "hardhat";
import config from "../config";

async function main() {
  const CedenMintPassV2 = await ethers.getContractFactory("CedenMintPassV2");
  const cedenMintPassV2 = await upgrades.upgradeProxy(
    config.CEDEN_MINT_PASS_PROXY_ADDRESS,
    CedenMintPassV2
  );
  await cedenMintPassV2.deployed();

  console.log("CedenMintPassV2 upgraded");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
