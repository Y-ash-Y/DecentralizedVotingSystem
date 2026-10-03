import test from "node:test";
import assert from "node:assert/strict";
import { networkConfig } from "../src/lib/network.js";
test("default network stays Sepolia",()=>assert.equal(networkConfig().chainId,11155111));
test("local chain requires a development build and explicit opt-in",()=>{
  for (const env of [{VITE_CHAIN_ID:31337},{VITE_CHAIN_ID:31337,DEV:true},{VITE_CHAIN_ID:31337,VITE_LOCAL_DEMO:"true"}]) {
    assert.throws(()=>networkConfig(env),/Local demo requires/);
  }
});
test("local testing is loopback-only with no misleading explorer",()=>{
  const n=networkConfig({VITE_CHAIN_ID:31337,DEV:true,VITE_LOCAL_DEMO:"true"});
  assert.equal(n.rpc,"http://127.0.0.1:8545");assert.equal(n.explorer,"");assert.equal(n.hex,"0x7a69");
});
test("mainnet and unsupported chains are rejected",()=>{
  for(const id of [1,10,137,"invalid"])assert.throws(()=>networkConfig({VITE_CHAIN_ID:id}),/Only Sepolia/);
});
test("fast timing requires an explicit local fixture flag",()=>{
  const env={VITE_CHAIN_ID:31337,DEV:true,VITE_LOCAL_DEMO:"true"};
  assert.equal(networkConfig(env).fastLocal,false);
  assert.equal(networkConfig({...env,VITE_FAST_LOCAL_TEST:"true"}).fastLocal,true);
  assert.throws(()=>networkConfig({VITE_FAST_LOCAL_TEST:"true"}),/local-only/);
});
