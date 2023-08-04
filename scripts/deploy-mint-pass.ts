import { ethers, upgrades } from "hardhat";
import config from "../config";

async function main() {
  const CedenMintPassV1 = await ethers.getContractFactory("CedenMintPassV1");
  const cedenMintPassV1 = await upgrades.deployProxy(
    CedenMintPassV1,
    [
      "CEDEN Mint Pass",
      "CMP",
      150000,
      config.LZ_ENDPOINT,
      config.USDC_ADDRESS,
      config.USDC_DECIMALS,
      config.FEE_RECEIVER,
    ],
    { initializer: "initialize" }
  );
  await cedenMintPassV1.deployed();

  console.log("CedenMintPassV1 deployed to:", cedenMintPassV1.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
