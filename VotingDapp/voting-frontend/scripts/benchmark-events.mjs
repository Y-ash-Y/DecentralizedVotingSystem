import { performance } from "node:perf_hooks";
import { strict as assert } from "node:assert";
import { createEventReader } from "../src/lib/chainData.js";

// Synthetic in-memory RPC: measures application work, NOT Ethereum throughput.
const rows=[];
for (const count of [1000,10000,100000,250000]) {
  const samples=[], heaps=[];
  let last;
  for (let repetition=0;repetition<7;repetition++) {
    global.gc?.();
    const before=process.memoryUsage().heapUsed;
    let calls=0;
    const contract={
      runner:{getNetwork:async()=>({chainId:31337n}),getBlockNumber:async()=>count,
        getBlock:async number=>({hash:`block-${number}`}),getCode:async()=>"0x1234",
        getLogs:async({fromBlock,toBlock})=>{
          calls++;
          return Array.from({length:toBlock-fromBlock+1},(_,i)=>({blockNumber:fromBlock+i,index:0,
            address:"0x0000000000000000000000000000000000000001",data:"0x",topics:[]}));
        }},
      interface:{parseLog:log=>({name:log.blockNumber===1?"ElectionCreated":"VoteCast",args:{electionId:1n}})},
      electionCount:async()=>1n,
    };
    const reader=createEventReader({address:"0x0000000000000000000000000000000000000001",deploymentBlock:1});
    const started=performance.now();
    const events=await reader.read(contract);
    samples.push(performance.now()-started);
    heaps.push((process.memoryUsage().heapUsed-before)/1024/1024);
    assert.equal(events.length,count);
    const coldCalls=calls;
    await reader.read(contract);assert.equal(calls,coldCalls);
    reader.invalidate();await reader.read(contract);
    assert.equal(calls,coldCalls+1);
    last={coldLogRequests:coldCalls,cachedLogRequests:0,incrementalLogRequests:1};
  }
  samples.sort((a,b)=>a-b);
  rows.push({events:count,samples:7,medianMs:+samples[3].toFixed(2),p95Ms:+samples[6].toFixed(2),
    maxObservedHeapDeltaMiB:+Math.max(...heaps).toFixed(2),...last});
}
console.log(JSON.stringify({node:process.version,platform:process.platform,architecture:process.arch,
  scope:"Synthetic RPC objects; no network latency, ABI decoding or UI rendering. Heap delta is not peak memory.",rows},null,2));
