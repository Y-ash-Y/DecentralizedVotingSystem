// Reproducible V2 gas fixture. No credentials or live-network transactions.
import { network as networkManager, artifacts } from "hardhat";
import { createRequire } from "node:module";
const hardhatVersion = createRequire(import.meta.url)("hardhat/package.json").version;
import { readBuildInfo } from "./build-info.js";
async function main() {
  const network = await networkManager.create();
  const { ethers } = network;
  if (network.networkName !== "hardhat") throw new Error("Disposable Hardhat network required");
  const [, voter] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("VotingSystemV2");
  const rows = [];
  const measure = async (operation, promise) => {
    const receipt = await (await promise).wait();
    rows.push({operation, gasUsed:Number(receipt.gasUsed)});
  };
  const voting = await Factory.deploy();
  await measure("deploy_v2", voting.deploymentTransaction());
  const start = (await ethers.provider.getBlock("latest")).timestamp + 100;
  await measure("create_commit_reveal", voting.createElection("Benchmark",start,start+3600,start+7200,true));
  await measure("add_4_candidates_batch", voting.addCandidates(1,["Alice","Bob","Simran","Raj"]));
  await measure("authorize_1_voter", voting.authorizeVoter(1,voter.address));
  await measure("seal_setup", voting.startElection(1));
  await network.provider.send("evm_setNextBlockTimestamp",[start]);
  const secret = "0x"+"ab".repeat(32); // Public deterministic benchmark fixture only.
  const commitment = await voting.commitmentFor(1,1,secret,voter.address);
  await measure("commit_vote",voting.connect(voter).commitVote(1,commitment));
  await network.provider.send("evm_setNextBlockTimestamp",[start+3600]);
  await measure("reveal_vote",voting.connect(voter).revealVote(1,1,secret));
  await network.provider.send("evm_setNextBlockTimestamp",[start+7200]);
  await network.provider.send("evm_mine");
  if ((await voting.getCandidateVotes(1,1)) !== 1n) throw new Error("Incorrect final tally");
  for (const size of [1,5,10,50]) {
    const addresses = Array.from({length:size},(_,i)=>ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(i+100),20)));
    const batch = await Factory.deploy(); await batch.waitForDeployment();
    const nextStart = (await ethers.provider.getBlock("latest")).timestamp + 1000;
    await batch.createElection("Batch",nextStart,nextStart+3600,nextStart+3600,false);
    await measure(`authorize_${size}_batch`,batch.authorizeVoters(1,addresses));
    const single = await Factory.deploy(); await single.waitForDeployment();
    await single.createElection("Single",nextStart,nextStart+3600,nextStart+3600,false);
    let total = 0;
    for (const address of addresses) total += Number((await (await single.authorizeVoter(1,address)).wait()).gasUsed);
    rows.push({operation:`authorize_${size}_individually_total`,gasUsed:total});
  }
  const artifact = await artifacts.readArtifact("VotingSystemV2");
  const build = await readBuildInfo(artifacts, "contracts/VotingV2.sol:VotingSystemV2");
  console.log(JSON.stringify({protocolVersion:2,network:"local Hardhat EVM (not Sepolia)",compiler:build.solcLongVersion,
    optimizer:build.input.settings.optimizer||{enabled:false},hardhat:hardhatVersion,
    node:process.version,runtimeBytes:(artifact.deployedBytecode.length-2)/2,
    deployedBytecodeHash:ethers.keccak256(artifact.deployedBytecode),rows},null,2));
}
main().catch(()=>{console.error("Local V2 benchmark failed. No live-network transaction was attempted.");process.exitCode=1;});
