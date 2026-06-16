const path = require("path");
// The .env lives at the repo root (one level up from this hardhat project).
// Resolve it from __dirname so it loads no matter which directory you run from.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");


// Env vars are only needed for live-network actions (deploy/verify on Sepolia).
// Fall back to safe defaults so local `hardhat test` runs without a configured .env.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};