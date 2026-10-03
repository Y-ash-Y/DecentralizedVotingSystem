import { expect } from "chai";
import { network } from "hardhat";
import localConfig from "../hardhat.local.config.js";

describe("Automatic local election clock", function () {
  it("mines idle blocks and progresses sealed elections without phase commands", async function () {
    this.timeout(45000);
    // A separate in-process EVM: never connect to or reset the user's demo node.
    const chain = await network.create({network:"hardhat",override:localConfig.networks.hardhat});
    const {ethers} = chain;
    const owner="0x0000000000000000000000000000000000000001";
    try {
      await chain.provider.send("hardhat_setBalance",[owner,"0x56bc75e2d63100000"]);
      await chain.provider.send("hardhat_impersonateAccount",[owner]);
      const factory=await ethers.getContractFactory("VotingSystemLocalTest",await ethers.provider.getSigner(owner));
      const voting=await factory.deploy();await voting.waitForDeployment();
      const start=(await ethers.provider.getBlock("latest")).timestamp+10;
      await (await voting.createElection("Automatic clock",start,start+6,start+12,true)).wait();
      await (await voting.addCandidates(1,["Alice","Bob"])).wait();
      await (await voting.authorizeVoter(1,owner)).wait();
      await (await voting.startElection(1)).wait();
      await chain.provider.send("hardhat_stopImpersonatingAccount",[owner]);
      const before=await ethers.provider.getBlock("latest");
      const seen=new Set([Number((await voting.getElection(1)).state)]);
      const deadline=Date.now()+35000;
      // Only reads and wall-clock waiting after setup: no evm_mine, time travel
      // or admin marker transactions may make this assertion pass.
      while(Date.now()<deadline && !seen.has(3)) {
        await new Promise(resolve=>setTimeout(resolve,250));
        seen.add(Number((await voting.getElection(1)).state));
      }
      expect([...seen].sort()).to.deep.equal([0,1,2,3]);
      const after=await ethers.provider.getBlock("latest");
      expect(after.number).to.be.greaterThan(before.number);
      expect(after.timestamp).to.be.at.least(start+12);
      for(let block=before.number+1;block<=after.number;block++) {
        expect((await ethers.provider.getBlock(block)).transactions).to.have.length(0);
      }
    } finally {await chain.close();}
  });
});
