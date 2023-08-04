import { ethers, upgrades } from "hardhat";
import config from "../config";

async function main() {
  const CedenKeystoneClaimer = await ethers.getContractFactory(
    "CedenKeystoneClaimer"
  );
  const cedenKeystoneClaimer = await CedenKeystoneClaimer.deploy(
    config.CEDEN_MINT_PASS_PROXY_ADDRESS,
    3333
  );
  console.log(
    "CedenKeystoneClaimer deployed to:",
    cedenKeystoneClaimer.address
  );

  const CedenKeystoneV1 = await ethers.getContractFactory("CedenKeystoneV1");
  const cedenKeystoneV1 = await upgrades.deployProxy(
    CedenKeystoneV1,
    [
      "CEDEN Keystone NFT Nodes",
      "KEY",
      150000,
      config.LZ_ENDPOINT,
      config.USDC_ADDRESS,
      config.USDC_DECIMALS,
      config.FEE_RECEIVER,
      cedenKeystoneClaimer.address,
    ],
    { initializer: "initialize" }
  );
  await cedenKeystoneV1.deployed();

  console.log("CedenKeystoneV1 deployed to:", cedenKeystoneV1.address);

  const setKeystoneAddressTx = await cedenKeystoneClaimer.setKeystoneAddress(
    cedenKeystoneV1.address
  );
  await setKeystoneAddressTx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
