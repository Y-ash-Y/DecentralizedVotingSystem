const { ethers } = require("hardhat");

async function main() {
  const VotingSystem = await ethers.getContractFactory("VotingSystem");

  const voting = await VotingSystem.deploy();

  await voting.deployed();

  console.log("Deployed to:", voting.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});