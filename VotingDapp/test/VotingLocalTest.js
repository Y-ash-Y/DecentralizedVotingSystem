import { network as networkManager } from "hardhat";
const network = await networkManager.create("hardhat");
const { ethers } = network;
import { expect } from "chai";
describe("Fast local-only voting fixture",function(){
  it("permits positive short intervals in both local and standard contracts",async function(){
    const local=await(await ethers.getContractFactory("VotingSystemLocalTest")).deploy();
    const standard=await(await ethers.getContractFactory("VotingSystemV2")).deploy();
    const start=(await ethers.provider.getBlock("latest")).timestamp+100;
    expect(await local.localTestMode()).to.equal(true);
    await local.createElection("Fast",start,start+1,start+2,true);
    await standard.createElection("Short",start,start+1,start+2,true);
    await expect(local.createElection("Invalid",start,start,start+2,true)).to.be.revertedWith("Voting phase too short");
    await expect(local.createElection("Invalid",start,start+1,start+1,true)).to.be.revertedWith("Reveal phase too short");
  });
  it("runs a short commit-reveal lifecycle and preserves seal/double-vote checks",async function(){
    const [owner,voter]=await ethers.getSigners();
    const local=await(await ethers.getContractFactory("VotingSystemLocalTest")).deploy();
    const start=(await ethers.provider.getBlock("latest")).timestamp+100;
    await local.createElection("Fast",start,start+30,start+60,true);
    await local.addCandidates(1,["Alice","Bob"]);
    await local.authorizeVoter(1,voter.address);await local.startElection(1);
    await expect(local.authorizeVoter(1,owner.address)).to.be.revertedWith("Setup closed");
    const secret="0x"+"ab".repeat(32);
    const hash=await local.commitmentFor(1,2,secret,voter.address);
    await network.provider.send("evm_setNextBlockTimestamp",[start]);
    await local.connect(voter).commitVote(1,hash);
    await network.provider.send("evm_setNextBlockTimestamp",[start+30]);
    await local.connect(voter).revealVote(1,2,secret);
    await expect(local.connect(voter).revealVote(1,2,secret)).to.be.revertedWith("Already revealed");
    await network.provider.send("evm_setNextBlockTimestamp",[start+60]);await network.provider.send("evm_mine");
    expect(await local.getCandidateVotes(1,2)).to.equal(1);
  });
});
