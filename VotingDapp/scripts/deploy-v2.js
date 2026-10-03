import { network as networkManager, artifacts } from "hardhat";
import { readBuildInfo } from "./build-info.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { assertDeploymentNetwork } from "./deployment-network.cjs";

async function main() {
  const network = await networkManager.create();
  const { ethers } = network;
  // No automatic source-address rewriting; each manifest is append-only.
  const { chainId } = await ethers.provider.getNetwork();
  assertDeploymentNetwork(network.networkName, chainId);
  const voting = await (await ethers.getContractFactory("VotingSystemV2")).deploy();
  const receipt = await voting.deploymentTransaction().wait();
  const code = await ethers.provider.getCode(voting.target);
  const abi = (await artifacts.readArtifact("VotingSystemV2")).abi;
  const manifest = {
    protocolVersion: 2, chainId:Number(chainId), address: voting.target, deploymentBlock: receipt.blockNumber,
    transactionHash: receipt.hash, runtimeCodeHash: ethers.keccak256(code),
    abiHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(abi))),
    compiler: (await readBuildInfo(artifacts, "contracts/VotingV2.sol:VotingSystemV2")).solcLongVersion,
    network: network.networkName,
  };
  // In-process Hardhat vanishes when this command exits, so do not publish a
  // misleading durable manifest for it. Useful as a no-funds deployment smoke test.
  if (network.networkName !== "hardhat") {
    const directory = path.resolve(__dirname,"../deployments",String(chainId));
    fs.mkdirSync(directory,{recursive:true});
    const filename = path.join(directory, `${voting.target}.json`);
    fs.writeFileSync(filename,JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
    console.log("Manifest:", filename);
  }
  console.log(JSON.stringify(manifest,null,2));
  console.log("No frontend settings were changed. Configure V2 explicitly from this manifest.");
}
main().catch(() => { console.error("Deployment or manifest save failed. Check the deployer's transaction history before retrying; do not deploy twice blindly."); process.exitCode=1; });
