import { network } from "hardhat";
import * as goerli from "./goerli";
import * as mainnet from "./mainnet";

const config = { goerli, mainnet };

export default config[network.name as keyof typeof config];
