import { expect } from "chai";
import {participants,assertLocalNode,phaseTimestamp} from "../scripts/local-demo-lib.cjs";
describe("Local demo safety guards",function(){
  it("requires distinct non-zero public wallet addresses",function(){
    const a="0x0000000000000000000000000000000000000001",b="0x0000000000000000000000000000000000000002";
    expect(participants(a,b).admin).to.equal(a);
    for(const args of [[a,a],[a,"bad"],[a,"0x0000000000000000000000000000000000000000"]])expect(()=>participants(...args)).to.throw();
  });
  it("refuses non-loopback, wrong-chain and forked nodes before mutation",async function(){
    const {readFile}=await import("node:fs/promises");
    const {default:localConfig}=await import("../hardhat.local.config.js");
    const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
    expect(pkg.scripts["demo:node"]).to.include("--network hardhat");
    expect(localConfig.networks.hardhat.accounts).to.deep.equal([]);
    expect(localConfig.networks.hardhat.mining).to.deep.equal({auto:true,interval:2000});
    expect(Object.keys(localConfig.networks)).to.have.members(["hardhat","localhost"]);
    const mock=(url,chainId,metadata)=>({connection:{url},getNetwork:async()=>({chainId}),send:async()=>metadata});
    const valid={clientVersion:"HardhatNetwork/2",instanceId:"abc"};
    expect((await assertLocalNode(mock("http://127.0.0.1:8545",31337,valid))).instanceId).to.equal("abc");
    expect((await assertLocalNode(mock("http://127.0.0.1:8545",31337,{...valid,clientVersion:"edr/0.3.8/revm/33.1.0"}))).instanceId).to.equal("abc");
    for(const provider of [mock("https://example.com",31337,valid),mock("http://127.0.0.1:8545",1,valid),mock("http://127.0.0.1:8545",31337,{...valid,forkedNetwork:{chainId:1}})]) {
      let rejected=false;try{await assertLocalNode(provider);}catch{rejected=true;}expect(rejected).to.equal(true);
    }
  });
  it("advances only sealed, future, valid phases",function(){
    const e={isSealed:true,commitReveal:true,startTime:100,votingEnd:200,endTime:300};
    expect(phaseTimestamp(e,"reveal",150)).to.equal(200);
    expect(()=>phaseTimestamp(e,"active",100)).to.throw(/already passed/);
    expect(()=>phaseTimestamp({...e,isSealed:false},"active",0)).to.throw(/Seal/);
    expect(()=>phaseTimestamp({...e,commitReveal:false},"reveal",0)).to.throw(/Plain/);
    expect(()=>phaseTimestamp(e,"invalid",0)).to.throw(/Phase/);
  });
});
