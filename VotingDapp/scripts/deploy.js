import { network as networkManager } from "hardhat";
import { assertDeploymentNetwork } from "./deployment-network.cjs";

async function main() {
  const network = await networkManager.create();
  const { ethers } = network;
  assertDeploymentNetwork(network.networkName, (await ethers.provider.getNetwork()).chainId);
  const VotingSystem = await ethers.getContractFactory("VotingSystem");

  const voting = await VotingSystem.deploy();

  await voting.waitForDeployment();

  console.log("Deployed to:", voting.target);
}

main().catch(() => {
  console.error("Deployment failed. Check network configuration and the deployer's transaction history before retrying. Credentials and raw RPC errors are not printed.");
  process.exitCode = 1;
});
