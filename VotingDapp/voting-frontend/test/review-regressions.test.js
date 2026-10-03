import test from "node:test";
import assert from "node:assert/strict";
import {queryLogsPaged,loadResults} from "../src/lib/chainData.js";
test("event scanner rejects a result beyond its memory budget",async()=>{
  await assert.rejects(queryLogsPaged({getLogs:async()=>[{},{}]},"0x",0,0,{maxLogs:1}),/browser limit/);
});
test("large log pages do not hit the JavaScript spread argument limit",async()=>{
  const rows=Array.from({length:150000},(_,index)=>({blockNumber:1,index}));
  assert.equal((await queryLogsPaged({getLogs:async()=>rows},"0x",1,1)).length,150000);
});
test("aggregate turnout cannot silently overflow even when each candidate fits",async()=>{
  const contract={runner:{getBlockNumber:async()=>1,getBlock:async()=>({hash:"stable"})},getCandidateVotes:async()=>BigInt(Number.MAX_SAFE_INTEGER)};
  await assert.rejects(loadResults(contract,"1",[{id:"1"},{id:"2"}]),/Total votes/);
});
