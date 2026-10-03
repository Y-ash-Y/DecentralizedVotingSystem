import { network as networkManager, artifacts } from "hardhat";
const network = await networkManager.create("hardhat");
const { ethers } = network;
import { expect } from "chai";

describe("Frontend helpers against the real local EVM", function () {
  let v6, helpers, commitments;
  before(async function () {
    v6 = await import("ethers");
    helpers = await import("../voting-frontend/src/lib/chainData.js");
    commitments = await import("../voting-frontend/src/lib/commitments.js");
  });

  it("accepts fast timing only when the deployed contract exposes the local fixture marker", async function () {
    const deployment = await import("../voting-frontend/src/lib/deployment.js");
    const abi = (await import("../voting-frontend/src/abiV2.js")).ABI_V2;
    const provider = new v6.BrowserProvider({request:({method,params})=>network.provider.send(method,params||[])});
    try {
      for (const name of ["VotingSystemLocalTest", "VotingSystemV2"]) {
        const voting = await (await ethers.getContractFactory(name)).deploy();
        await voting.waitForDeployment();
        const contract = new v6.Contract(voting.target,abi,provider);
        let accepted = false;
        try {
          await deployment.verifyDeployment(contract,{address:voting.target,chainId:31337,version:2,
            codeHash:v6.keccak256(await provider.getCode(voting.target)),fastLocal:true});
          accepted = true;
        } catch (error) {
          if (name === "VotingSystemLocalTest") throw error;
        }
        expect(accepted).to.equal(name === "VotingSystemLocalTest");
      }
    } finally {provider.destroy();}
  });

  it("round-trips frontend commitments, paginated events and final tally through the development contract stack", async function () {
    const [, voter] = await ethers.getSigners();
    const voting = await (await ethers.getContractFactory("VotingSystem")).deploy();
    await voting.waitForDeployment();
    const receipt = await voting.deploymentTransaction().wait();
    await voting.createElection("Integration", 0, 9999999999, true);
    await voting.addCandidates(1, ["Alice", "Bob"]);
    await voting.authorizeVoters(1, [voter.address]);
    await voting.startElection(1);
    const secret = commitments.generateSecret();
    const hash = commitments.commitmentHash("2", secret, voter.address);
    await voting.connect(voter).commitVote(1, hash);
    await voting.startReveal(1);
    await voting.connect(voter).revealVote(1, 2, secret);
    await voting.endElection(1);

    const provider = new v6.BrowserProvider({ request: ({ method, params }) => network.provider.send(method, params || []) });
    const abi = (await import("../voting-frontend/src/contract.js")).CONTRACT_ABI;
    const contract = new v6.Contract(voting.target, abi, provider);
    const reader = helpers.createEventReader({ address: voting.target, deploymentBlock: receipt.blockNumber });
    const events = await reader.read(contract);
    expect(events.filter(e => e.name === "VoteCommitted")).to.have.length(1);
    expect(events.filter(e => e.name === "VoteRevealed")).to.have.length(1);
    const candidates = events.filter(e => e.name === "CandidateAdded").map(e => ({ id: String(e.args.candidateId), name: e.args.name }));
    const results = await helpers.loadResults(contract, "1", candidates);
    expect(results.map(r => r.votes)).to.deep.equal([0, 1]);
    provider.destroy();
  });

  it("agrees with an independent tally model across elections and seeded vote sequences", async function () {
    const signers = await ethers.getSigners();
    for (const seed of [7, 42, 2026]) {
      const voting = await (await ethers.getContractFactory("VotingSystem")).deploy();
      await voting.waitForDeployment();
      const expected = [0, 0, 0];
      await voting.createElection("Plain", 0, 9999999999, false);
      await voting.createElection("Separate", 0, 9999999999, false);
      for (const election of [1, 2]) {
        await voting.addCandidates(election, ["A", "B", "C"]);
        await voting.authorizeVoters(election, signers.slice(1, 13).map(s => s.address));
        await voting.startElection(election);
      }
      let state = seed;
      for (const voter of signers.slice(1, 13)) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const candidate = state % 3 + 1;
        await voting.connect(voter).vote(1, candidate);
        expected[candidate - 1]++;
        await expect(voting.connect(voter).vote(1, candidate)).to.be.revertedWith("Already voted");
      }
      await voting.connect(signers[1]).vote(2, 3); // Same wallet, independent election.
      await voting.endElection(1); await voting.endElection(2);
      const actual = await Promise.all([1, 2, 3].map(i => voting.getCandidateVotes(1, i)));
      expect(actual.map(n => Number(n))).to.deep.equal(expected);
      expect(actual.reduce((sum, n) => sum + Number(n), 0)).to.equal(12);
      expect(await voting.getCandidateVotes(2, 3)).to.equal(1);
    }
  });

  it("a copied commitment cannot be revealed by a different authorized wallet", async function () {
    const [, voter, attacker] = await ethers.getSigners();
    const voting = await (await ethers.getContractFactory("VotingSystem")).deploy();
    await voting.waitForDeployment();
    await voting.createElection("Copy", 0, 9999999999, true);
    await voting.addCandidate(1, "Alice");
    await voting.authorizeVoters(1, [voter.address, attacker.address]);
    await voting.startElection(1);
    const secret = commitments.generateSecret();
    const hash = commitments.commitmentHash("1", secret, voter.address);
    await voting.connect(voter).commitVote(1, hash);
    await voting.connect(attacker).commitVote(1, hash);
    await voting.startReveal(1);
    await expect(voting.connect(attacker).revealVote(1, 1, secret)).to.be.revertedWith("Reveal does not match commitment");
    await voting.connect(voter).revealVote(1, 1, secret);
  });

  it("V2 frontend discovers revoked eligibility, scheduled phases and tallies without admin phase transactions", async function () {
    const [owner, voter, delegate] = await ethers.getSigners();
    const voting = await (await ethers.getContractFactory("VotingSystemV2")).deploy();
    const receipt = await voting.deploymentTransaction().wait();
    const start = (await ethers.provider.getBlock("latest")).timestamp + 100;
    await voting.createElection("Scheduled", start, start + 3600, start + 7200, true);
    await voting.addCandidates(1, ["Alice", "Bob"]);
    await voting.authorizeVoters(1, [voter.address, delegate.address]);
    await voting.revokeVoter(1, delegate.address);
    await voting.assignAdmin(1, delegate.address);
    await voting.connect(delegate).startElection(1);
    const provider = new v6.BrowserProvider({ request: ({ method, params }) => network.provider.send(method, params || []) }, undefined, {cacheTimeout: -1});
    try {
      const abi = (await import("../voting-frontend/src/abiV2.js")).ABI_V2;
      const contract = new v6.Contract(voting.target, abi, provider);
      const deployment = await import("../voting-frontend/src/lib/deployment.js");
      await deployment.verifyDeployment(contract, {address:voting.target, chainId:31337, version:2, codeHash:v6.keccak256(await provider.getCode(voting.target))});
      const reader = helpers.createEventReader({address:voting.target, deploymentBlock:receipt.blockNumber});
      let events = await reader.read(contract);
      expect(events.filter(e=>e.name === "VoterRevoked")).to.have.length(1);
      const list = [{id:"1", name:"Scheduled", state:"active"}]; // Seal marker is not active.
      let [meta] = await deployment.enrichElections(contract, list, delegate.address);
      expect(meta.state).to.equal("created"); expect(meta.canManage).to.equal(true);
      expect((await deployment.enrichElections(contract, list, voter.address))[0].canManage).to.equal(false);
      await network.provider.send("evm_setNextBlockTimestamp", [start]);
      await network.provider.send("evm_mine");
      const secret = commitments.generateSecret();
      const hash = commitments.commitmentHash("2", secret, voter.address, {chainId:31337,contract:voting.target,electionId:1});
      await voting.connect(voter).commitVote(1, hash);
      await network.provider.send("evm_setNextBlockTimestamp", [start+3600]);
      await network.provider.send("evm_mine");
      [meta] = await deployment.enrichElections(contract, list, owner.address);
      expect(meta.state).to.equal("reveal");
      await voting.connect(voter).revealVote(1, 2, secret);
      await network.provider.send("evm_setNextBlockTimestamp", [start+7200]);
      await network.provider.send("evm_mine");
      expect((await deployment.enrichElections(contract, list, owner.address))[0].state).to.equal("ended");
      reader.invalidate(); events = await reader.read(contract);
      expect(events.filter(e=>e.name === "RevealStarted" || e.name === "ElectionEnded")).to.have.length(0);
      const candidates = events.filter(e=>e.name === "CandidateAdded").map(e=>({id:String(e.args.candidateId),name:e.args.name}));
      expect((await helpers.loadResults(contract,"1",candidates)).map(r=>r.votes)).to.deep.equal([0,1]);
    } finally { provider.destroy(); }
  });
});
