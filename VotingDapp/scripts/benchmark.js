// Local measurements, not estimates or live-network transactions.
import { network as networkManager, artifacts } from "hardhat";
import { createRequire } from "node:module";
const hardhatVersion = createRequire(import.meta.url)("hardhat/package.json").version;
import { readBuildInfo } from "./build-info.js";

async function main() {
  const network = await networkManager.create();
  const { ethers } = network;
  if (network.networkName !== "hardhat") throw new Error("Benchmark only runs on the disposable Hardhat network");
  const [, voter] = await ethers.getSigners();
  const rows = [];
  async function measure(operation, promise) {
    const receipt = await (await promise).wait();
    rows.push({ operation, gasUsed: Number(receipt.gasUsed) });
  }
  const Factory = await ethers.getContractFactory("VotingSystem");
  const voting = await Factory.deploy();
  await measure("deploy", voting.deploymentTransaction());
  await measure("create_plain", voting.createElection("Benchmark", 0, 9999999999, false));
  await measure("add_4_candidates_batch", voting.addCandidates(1, ["Alice", "Bob", "Simran", "Raj"]));
  await measure("authorize_1_voter", voting.authorizeVoter(1, voter.address));
  await measure("start_plain", voting.startElection(1));
  await measure("vote_first_for_candidate", voting.connect(voter).vote(1, 1));
  await measure("end_plain", voting.endElection(1));
  await measure("create_commit_reveal", voting.createElection("Commit", 0, 9999999999, true));
  await voting.addCandidate(2, "Alice");
  await voting.authorizeVoter(2, voter.address);
  await voting.startElection(2);
  const secret = "0x" + "ab".repeat(32); // Deterministic test fixture; never a production secret.
  const hash = ethers.solidityPackedKeccak256(["uint256", "string", "address"], [1, secret, voter.address]);
  await measure("commit_vote", voting.connect(voter).commitVote(2, hash));
  await measure("start_reveal", voting.startReveal(2));
  await measure("reveal_vote", voting.connect(voter).revealVote(2, 1, secret));
  await measure("end_commit_reveal", voting.endElection(2));
  for (const size of [1, 5, 10]) {
    const addresses = Array.from({ length: size }, (_, i) => ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(i + 100), 20)));
    const batch = await Factory.deploy(); await batch.waitForDeployment();
    await batch.createElection("Batch", 0, 9999999999, false);
    await measure(`authorize_${size}_batch`, batch.authorizeVoters(1, addresses));
    const single = await Factory.deploy(); await single.waitForDeployment();
    await single.createElection("Single", 0, 9999999999, false);
    let gas = 0;
    for (const address of addresses) gas += Number((await (await single.authorizeVoter(1, address)).wait()).gasUsed);
    rows.push({ operation: `authorize_${size}_individually_total`, gasUsed: gas });
  }
  const artifact = await artifacts.readArtifact("VotingSystem");
  const build = await readBuildInfo(artifacts, "contracts/Voting.sol:VotingSystem");
  console.log(JSON.stringify({
    network: "local Hardhat EVM (not Sepolia)",
    compiler: build.solcLongVersion, optimizer: build.input.settings.optimizer || { enabled: false },
    hardhat: hardhatVersion,
    node: process.version, deployedBytecodeHash: ethers.keccak256(artifact.deployedBytecode), rows,
  }, null, 2));
}
main().catch(() => { console.error("Local benchmark failed; no deployment was attempted on a live network."); process.exitCode = 1; });
