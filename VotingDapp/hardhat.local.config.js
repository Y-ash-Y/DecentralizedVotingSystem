// Isolated demo: no .env, public networks or unlocked funded accounts.
import { defineConfig } from "hardhat/config";
import ethersPlugin from "@nomicfoundation/hardhat-ethers";
export default defineConfig({
  plugins:[ethersPlugin],
  solidity:{version:"0.8.20",settings:{optimizer:{enabled:false,runs:200},evmVersion:"paris"}},
  networks:{
    // Empty blocks keep scheduled phases moving even while every wallet is idle.
    // Keep instant transaction mining as well, for responsive local approvals.
    hardhat:{type:"edr-simulated",chainType:"l1",chainId:31337,accounts:[],
      mining:{auto:true,interval:2000}},
    localhost:{type:"http",chainType:"l1",url:"http://127.0.0.1:8545",chainId:31337},
  },
});
