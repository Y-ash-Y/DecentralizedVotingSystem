import { network as networkManager, artifacts } from "hardhat";
const network = await networkManager.create("hardhat");
const { ethers } = network;
import { expect } from "chai";

describe("VotingSystemV2: schedule, governance and domain invariants", function () {
  let c, owner, admin, voter, other, start, close, end;
  const secret = "0x" + "ab".repeat(32);
  const mineAt = async time => { await network.provider.send("evm_setNextBlockTimestamp", [time]); await network.provider.send("evm_mine"); };
  beforeEach(async () => {
    [owner, admin, voter, other] = await ethers.getSigners();
    c = await (await ethers.getContractFactory("VotingSystemV2")).deploy(); await c.waitForDeployment();
    start = (await ethers.provider.getBlock("latest")).timestamp + 1000;
    close = start + 3600; end = close + 3600;
    await c.createElection("Council", start, close, end, true);
  });
  const setup = async () => {
    await c.addCandidates(1, ["Alice", "Bob"]);
    await c.authorizeVoter(1, voter.address);
    await c.startElection(1);
  };
  it("ABI matches the generated frontend ABI exactly", async () => {
    const frontend = await import("../voting-frontend/src/abiV2.js");
    expect(frontend.ABI_V2).to.deep.equal((await artifacts.readArtifact("VotingSystemV2")).abi);
  });
  it("deployment fits the EVM 24KB runtime bytecode limit", async () => {
    expect(((await ethers.provider.getCode(c.target)).length-2)/2).to.be.lessThan(24576);
    expect(await c.protocolVersion()).to.equal(2);
  });
  it("publishes an immutable schedule and initial state", async () => {
    const e = await c.getElection(1);
    expect(e.startTime).to.equal(start); expect(e.votingEnd).to.equal(close);
    expect(e.endTime).to.equal(end); expect(e.state).to.equal(0);
  });
  it("rejects past starts, zero/reversed windows and inconsistent plain endings", async () => {
    await expect(c.createElection("A", 0, close, end, true)).to.be.revertedWith("Start must be in future");
    await expect(c.createElection("A", start, start, end, true)).to.be.revertedWith("Voting phase too short");
    await expect(c.createElection("A", start, start-1, end, true)).to.be.revertedWith("Voting phase too short");
    await expect(c.createElection("A", start, close, close, true)).to.be.revertedWith("Reveal phase too short");
    await expect(c.createElection("A", start, close, close-1, true)).to.be.revertedWith("Reveal phase too short");
    await expect(c.createElection("A", start, close, end, false)).to.be.revertedWith("Plain end must equal voting end");
  });
  it("accepts one-second and one-minute windows for both ballot modes", async () => {
    expect(await c.MIN_PHASE_DURATION()).to.equal(1n);
    for (const duration of [1,60]) {
      await c.createElection("Short commit",start,start+duration,start+2*duration,true);
      await c.createElection("Short plain",start,start+duration,start+duration,false);
    }
  });
  it("counts a standard-contract ballot through one-minute commit and reveal windows", async () => {
    await c.createElection("Minute ballot",start,start+60,start+120,true);
    await c.addCandidates(2,["Alice","Bob"]);
    await c.authorizeVoter(2,voter.address);
    await c.startElection(2);
    await mineAt(start);
    const hash=await c.commitmentFor(2,1,secret,voter.address);
    await c.connect(voter).commitVote(2,hash);
    await mineAt(start+60);
    await expect(c.connect(other).commitVote(2,hash)).to.be.revertedWith("Commit phase closed");
    await c.connect(voter).revealVote(2,1,secret);
    await mineAt(start+120);
    await expect(c.connect(voter).revealVote(2,1,secret)).to.be.revertedWith("Not in reveal phase");
    expect(await c.getCandidateVotes(2,1)).to.equal(1);
    expect(await c.getCandidateVotes(2,2)).to.equal(0);
  });
  it("only the super admin creates or delegates elections", async () => {
    await expect(c.connect(other).createElection("A",start,close,end,true)).to.be.revertedWith("Not super admin");
    await expect(c.connect(other).assignAdmin(1,other.address)).to.be.revertedWith("Not super admin");
    await expect(c.assignAdmin(1,ethers.ZeroAddress)).to.be.revertedWith("Zero address");
  });
  it("assigns and revokes per-election roles", async () => {
    await c.assignAdmin(1, admin.address);
    expect(await c.isElectionAdmin(1,admin.address)).to.equal(true);
    await c.connect(admin).addCandidate(1,"Alice");
    await c.revokeAdmin(1,admin.address);
    await expect(c.connect(admin).addCandidate(1,"Bob")).to.be.revertedWith("Not election admin");
  });
  it("validates candidate names and rolls back a mixed invalid batch atomically", async () => {
    await expect(c.addCandidates(1,["Alice", " "])).to.be.revertedWith("Blank name");
    expect((await c.getElection(1)).candidateCount).to.equal(0);
    await expect(c.addCandidate(1, "")).to.be.revertedWith("Name must be 1-100 bytes");
    await expect(c.addCandidate(1, "x".repeat(101))).to.be.revertedWith("Name must be 1-100 bytes");
    await c.addCandidate(1,"Alice");
    await expect(c.addCandidate(1,"Alice")).to.be.revertedWith("Duplicate candidate");
  });
  it("bounds batches and total candidate count", async () => {
    await expect(c.addCandidates(1,[])).to.be.revertedWith("Invalid batch size");
    await expect(c.authorizeVoters(1,[])).to.be.revertedWith("Invalid batch size");
    await expect(c.authorizeVoters(1,Array(51).fill(voter.address))).to.be.revertedWith("Invalid batch size");
    for (const offset of [0,50]) await c.addCandidates(1,Array.from({length:50},(_,i)=>`Candidate ${offset+i}`));
    await expect(c.addCandidate(1,"Extra")).to.be.revertedWith("Candidate limit");
  });
  it("does not double-count duplicate authorized addresses and supports setup revocation", async () => {
    await c.authorizeVoters(1,[voter.address,voter.address]);
    expect((await c.getElection(1)).voterCount).to.equal(1);
    await c.revokeVoter(1,voter.address);
    expect((await c.getElection(1)).voterCount).to.equal(0);
    expect((await c.getVoter(1,voter.address)).authorized).to.equal(false);
    await expect(c.authorizeVoters(1,[voter.address,ethers.ZeroAddress])).to.be.revertedWith("Zero address");
    expect((await c.getVoter(1,voter.address)).authorized).to.equal(false);
  });
  it("requires a candidate slate and voters before sealing", async () => {
    await expect(c.startElection(1)).to.be.revertedWith("Incomplete setup");
    await c.addCandidates(1,["Alice","Bob"]);
    await expect(c.startElection(1)).to.be.revertedWith("Incomplete setup");
    await c.authorizeVoter(1,voter.address); await c.startElection(1);
    expect((await c.getElection(1)).isSealed).to.equal(true);
  });
  it("freezes setup immediately on sealing and cannot cancel afterward", async () => {
    await setup();
    for (const operation of [()=>c.addCandidate(1,"C"),()=>c.authorizeVoter(1,other.address),()=>c.revokeVoter(1,voter.address),()=>c.cancelElection(1),()=>c.startElection(1)])
      await expect(operation()).to.be.revertedWith("Setup closed");
  });
  it("abandons unsealed setup at start without an admin transaction", async () => {
    await mineAt(start); expect(await c.electionState(1)).to.equal(4);
    await expect(c.startElection(1)).to.be.revertedWith("Setup closed");
    await expect(c.authorizeVoter(1,voter.address)).to.be.revertedWith("Setup closed");
  });
  it("cancels unsealed setup permanently", async () => {
    await c.cancelElection(1); expect(await c.electionState(1)).to.equal(4);
    await expect(c.addCandidate(1,"C")).to.be.revertedWith("Setup closed");
  });
  it("derives each phase at the exact half-open interval boundary", async () => {
    await setup();
    for (const [time,state] of [[start-1,0],[start,1],[close-1,1],[close,2],[end-1,2],[end,3]]) {
      await mineAt(time); expect(await c.electionState(1)).to.equal(state);
    }
  });
  it("rejects early commit, premature reveal markers and early closure even by the owner", async () => {
    await setup(); const hash = await c.commitmentFor(1,1,secret,voter.address);
    await expect(c.connect(voter).commitVote(1,hash)).to.be.revertedWith("Commit phase closed");
    await mineAt(start);
    await expect(c.startReveal(1)).to.be.revertedWith("Not in reveal phase");
    await expect(c.endElection(1)).to.be.revertedWith("Election not ended");
  });
  it("counts a valid reveal without an admin opening the phase", async () => {
    await setup(); await mineAt(start);
    const hash = await c.commitmentFor(1,2,secret,voter.address);
    await c.connect(voter).commitVote(1,hash);
    await mineAt(close); await c.connect(voter).revealVote(1,2,secret);
    await expect(c.connect(voter).revealVote(1,2,secret)).to.be.revertedWith("Already revealed");
    await mineAt(end); expect(await c.getCandidateVotes(1,2)).to.equal(1);
    await c.connect(other).endElection(1);
    await expect(c.endElection(1)).to.be.revertedWith("Already reported");
  });
  it("forbids commits at closing and reveals at election end", async () => {
    await setup(); const hash = await c.commitmentFor(1,1,secret,voter.address);
    await network.provider.send("evm_setNextBlockTimestamp",[start]);
    await c.connect(voter).commitVote(1,hash); // accepted exactly at start
    await mineAt(close); // A rejected gas estimate need not mine a block.
    await expect(c.connect(other).commitVote(1,hash)).to.be.revertedWith("Commit phase closed");
    await mineAt(end);
    await expect(c.connect(voter).revealVote(1,1,secret)).to.be.revertedWith("Not in reveal phase");
    expect(await c.getCandidateVotes(1,1)).to.equal(0);
  });
  it("validates read IDs and withholds the tally API until end", async () => {
    await setup();
    await expect(c.getCandidateVotes(1,0)).to.be.revertedWith("Invalid candidate");
    await expect(c.getCandidateVotes(99,1)).to.be.revertedWith("Election does not exist");
    await expect(c.getCandidateVotes(1,1)).to.be.revertedWith("Results not available yet");
    await expect(c.getVoter(0,voter.address)).to.be.revertedWith("Election does not exist");
  });
  it("allows permissionless phase markers exactly once without changing the schedule", async () => {
    await setup();await mineAt(close);
    await expect(c.connect(other).startReveal(1)).to.emit(c,"RevealStarted").withArgs(1);
    await expect(c.connect(other).startReveal(1)).to.be.revertedWith("Already reported");
    expect((await c.getElection(1)).state).to.equal(2);
    await mineAt(end);
    await expect(c.connect(other).endElection(1)).to.emit(c,"ElectionEnded").withArgs(1);
    await expect(c.connect(other).endElection(1)).to.be.revertedWith("Already reported");
    expect((await c.getElection(1)).endTime).to.equal(end);
  });
  it("rejects zero commitments, unauthorized and repeated commitments", async () => {
    await setup(); await mineAt(start);
    const hash = await c.commitmentFor(1,1,secret,voter.address);
    await expect(c.connect(voter).commitVote(1,ethers.ZeroHash)).to.be.revertedWith("Empty commitment");
    await expect(c.connect(other).commitVote(1,hash)).to.be.revertedWith("Not authorized");
    await c.connect(voter).commitVote(1,hash);
    await expect(c.connect(voter).commitVote(1,hash)).to.be.revertedWith("Already committed");
  });
  it("rejects missing, mismatched and invalid-candidate reveals", async () => {
    await setup(); await mineAt(start);
    await c.connect(voter).commitVote(1,await c.commitmentFor(1,1,secret,voter.address));
    await mineAt(close);
    await expect(c.connect(other).revealVote(1,1,secret)).to.be.revertedWith("No commitment found");
    await expect(c.connect(voter).revealVote(1,2,secret)).to.be.revertedWith("Reveal does not match commitment");
    await expect(c.connect(voter).revealVote(1,3,secret)).to.be.revertedWith("Invalid candidate");
  });
  it("separates elections, deployments, voters, candidates and chain domains", async () => {
    await c.createElection("Other",start,close,end,true);
    const second = await (await ethers.getContractFactory("VotingSystemV2")).deploy(); await second.waitForDeployment();
    await second.createElection("Other",start,close,end,true);
    const hash = await c.commitmentFor(1,1,secret,voter.address);
    expect(hash).not.to.equal(await c.commitmentFor(2,1,secret,voter.address));
    expect(hash).not.to.equal(await second.commitmentFor(1,1,secret,voter.address));
    expect(hash).not.to.equal(await c.commitmentFor(1,1,secret,other.address));
    expect(hash).not.to.equal(await c.commitmentFor(1,2,secret,voter.address));
    const { commitmentHash } = await import("../voting-frontend/src/lib/commitments.js");
    const domain = { chainId:31337, contract:c.target, electionId:1 };
    expect(commitmentHash("1",secret,voter.address,domain)).to.equal(hash);
    expect(commitmentHash("1",secret,voter.address,{...domain,chainId:1})).not.to.equal(hash);
  });
  it("uses two-step ownership transfer and removes previous implicit authority", async () => {
    await expect(c.proposeSuperAdmin(ethers.ZeroAddress)).to.be.revertedWith("Invalid successor");
    await c.proposeSuperAdmin(admin.address);
    await expect(c.connect(other).acceptSuperAdmin()).to.be.revertedWith("Not pending super admin");
    await c.connect(admin).acceptSuperAdmin();
    expect(await c.isElectionAdmin(1,owner.address)).to.equal(false);
    expect(await c.isElectionAdmin(1,admin.address)).to.equal(true);
    await expect(c.assignAdmin(1,other.address)).to.be.revertedWith("Not super admin");
  });
  it("plain mode rejects commit/reveal, prevents double voting and ends without admin", async () => {
    await c.createElection("Plain",start,close,close,false);
    await c.addCandidates(2,["Alice","Bob"]); await c.authorizeVoter(2,voter.address); await c.startElection(2);
    await mineAt(start);
    await expect(c.connect(voter).vote(1,1)).to.be.revertedWith("Use commit-reveal voting");
    await expect(c.connect(voter).commitVote(2,secret)).to.be.revertedWith("Not a commit-reveal election");
    await expect(c.connect(other).vote(2,1)).to.be.revertedWith("Not authorized");
    await expect(c.connect(voter).vote(2,3)).to.be.revertedWith("Invalid candidate");
    await c.connect(voter).vote(2,2);
    await expect(c.connect(voter).vote(2,2)).to.be.revertedWith("Already voted");
    await mineAt(close); expect(await c.getCandidateVotes(2,2)).to.equal(1);
    await expect(c.connect(voter).vote(2,1)).to.be.revertedWith("Election not active");
  });
});
