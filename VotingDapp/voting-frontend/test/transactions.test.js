import test from "node:test";
import assert from "node:assert/strict";
import {confirmedReceipt,transactionError} from "../src/lib/transactions.js";
const original={to:"0x1234",data:"0xab",value:0n};
test("accepts a successful receipt",async()=>assert.equal((await confirmedReceipt({wait:async()=>({status:1,hash:"ok"})})).hash,"ok"));
test("missing or reverted receipts are not success",async()=>{
  for(const value of [null,{status:0},{hash:"unverified"}])await assert.rejects(confirmedReceipt({wait:async()=>value}),{code:"RECEIPT_FAILED"});
});
test("accepts only equivalent successful fee repricing",async()=>{
  const error={code:"TRANSACTION_REPLACED",reason:"repriced",cancelled:false,replacement:{...original},receipt:{status:1,hash:"replacement"}};
  assert.equal((await confirmedReceipt({...original,wait:async()=>{throw error;}})).hash,"replacement");
});
test("cancellation and changed replacement calldata are not the intended transaction",async()=>{
  for(const extra of [{cancelled:true},{reason:"replaced"},{replacement:{...original,data:"0xcd"}},{replacement:{...original,value:1n}},{replacement:{...original,to:"0x5678"}}]) {
    const error={code:"TRANSACTION_REPLACED",reason:"repriced",cancelled:false,replacement:{...original},receipt:{status:1},...extra};
    await assert.rejects(confirmedReceipt({...original,wait:async()=>{throw error;}}));
  }
});
test("wallet errors never expose arbitrary raw RPC payloads",()=>{
  const secret="0x"+"a".repeat(64);
  for(const error of [{message:`failed https://rpc.example/key ${secret}`},{reason:`secret ${secret}`},{reason:"https://rpc.example/credential"}]) {
    const message=transactionError(error);assert.ok(!message.includes(secret));assert.ok(!message.includes("rpc.example"));
  }
  assert.match(transactionError({code:4001}),/rejected/);
  assert.match(transactionError({code:"WALLET_CHANGED"}),/account changed/);
  assert.equal(transactionError({reason:"Already voted"}),"Already voted");
  assert.match(transactionError({code:"PHASE_MINIMUM",minimum:3600n}), /requires 3600 seconds/);
  assert.match(transactionError({code:"START_NOT_FUTURE"}), /latest chain timestamp/);
  for (const minimum of ["private-value", 0n, 31_536_001n]) {
    assert.ok(!transactionError({code:"PHASE_MINIMUM",minimum}).includes("requires"));
  }
  for (const reason of ["a".repeat(64), "backup secret: personal-phrase", "api_token=private-value"]) {
    assert.ok(!transactionError({reason}).includes(reason));
  }
});
