import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig, configVariable } from "hardhat/config";
import ethersPlugin from "@nomicfoundation/hardhat-ethers";
import chaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import mochaPlugin from "@nomicfoundation/hardhat-mocha";

dotenv.config({path:fileURLToPath(new URL("../.env",import.meta.url)),quiet:true});
export default defineConfig({
  plugins:[ethersPlugin,chaiMatchers,mochaPlugin],
  // Preserve compiler settings while migrating the development toolchain.
  solidity:{version:"0.8.20",settings:{optimizer:{enabled:false,runs:200},evmVersion:"paris"}},
  networks:{
    hardhat:{type:"edr-simulated",chainType:"l1",chainId:31337},
    localhost:{type:"http",chainType:"l1",url:"http://127.0.0.1:8545",chainId:31337},
    sepolia:{type:"http",chainType:"l1",chainId:11155111,
      url:configVariable("SEPOLIA_RPC_URL"),accounts:[configVariable("PRIVATE_KEY")]},
  },
});
