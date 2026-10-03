import { expect } from "chai";
import { network as networkManager, artifacts } from "hardhat";
const network = await networkManager.create("hardhat");
const { ethers } = network;

// Deterministic model-based scenarios, not an exhaustive fuzzing claim.
describe("V2 seeded independent ballot model", function () {
  for (const seed of [7, 42, 2026, 65537, 99001]) {
    for (const secretMode of [false, true]) {
      it(`matches independent ${secretMode ? "revealed" : "plain"} tally for seed ${seed}`, async function () {
        let state = seed;
        const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
        const [, ...voters] = await ethers.getSigners();
        const pool = voters.slice(0, 12);
        const voting = await (await ethers.getContractFactory("VotingSystemV2")).deploy();
        const start = (await ethers.provider.getBlock("latest")).timestamp + 1000;
        await voting.createElection("Model",start,start+3600,secretMode?start+7200:start+3600,secretMode);
        await voting.addCandidates(1,["A","B","C"]);
        const eligible = new Set();
        // Repeated authorize/revoke operations must match a Set, not count calls.
        for (let i=0;i<40;i++) {
          const voter=pool[next()%pool.length];
          if (next()%3 === 0 && eligible.has(voter.address)) {
            await voting.revokeVoter(1,voter.address);eligible.delete(voter.address);
          } else {
            await voting.authorizeVoter(1,voter.address);eligible.add(voter.address);
          }
          expect((await voting.getElection(1)).voterCount).to.equal(eligible.size);
        }
        await voting.authorizeVoter(1,pool[0].address);eligible.add(pool[0].address);
        await voting.startElection(1);
        await expect(voting.authorizeVoter(1,pool[1].address)).to.be.revertedWith("Setup closed");
        await network.provider.send("evm_setNextBlockTimestamp",[start]);
        await network.provider.send("evm_mine");
        const expected=[0,0,0], ballots=[];
        for (const voter of pool) {
          const candidate=next()%3+1;
          if (!eligible.has(voter.address)) {
            const call=secretMode?voting.connect(voter).commitVote(1,ethers.zeroPadValue("0x01",32)):voting.connect(voter).vote(1,candidate);
            await expect(call).to.be.revertedWith("Not authorized");continue;
          }
          if (secretMode) {
            const secret=ethers.keccak256(ethers.toUtf8Bytes(`${seed}:${voter.address}`));
            const hash=await voting.commitmentFor(1,candidate,secret,voter.address);
            await voting.connect(voter).commitVote(1,hash);
            await expect(voting.connect(voter).commitVote(1,hash)).to.be.revertedWith("Already committed");
            ballots.push({voter,candidate,secret,reveal:next()%4!==0});
          } else {
            await voting.connect(voter).vote(1,candidate);expected[candidate-1]++;
            await expect(voting.connect(voter).vote(1,candidate)).to.be.revertedWith("Already voted");
          }
        }
        if (secretMode) {
          await network.provider.send("evm_setNextBlockTimestamp",[start+3600]);
          await network.provider.send("evm_mine");
          for (const b of ballots.filter(b=>b.reveal)) {
            const wrong=b.candidate%3+1;
            await expect(voting.connect(b.voter).revealVote(1,wrong,b.secret)).to.be.revertedWith("Reveal does not match commitment");
            await voting.connect(b.voter).revealVote(1,b.candidate,b.secret);expected[b.candidate-1]++;
            await expect(voting.connect(b.voter).revealVote(1,b.candidate,b.secret)).to.be.revertedWith("Already revealed");
          }
        }
        await network.provider.send("evm_setNextBlockTimestamp",[start+(secretMode?7200:3600)]);
        await network.provider.send("evm_mine");
        const actual=await Promise.all([1,2,3].map(id=>voting.getCandidateVotes(1,id)));
        expect(actual.map(n=>Number(n))).to.deep.equal(expected);
        expect(expected.reduce((a,b)=>a+b,0)).to.be.at.most(eligible.size);
      });
    }
  }
});
