import test from "node:test";
import assert from "node:assert/strict";
import { safeErrorDetail } from "../src/lib/errors.js";

test("read and backup errors never echo arbitrary provider or JSON contents",()=>{
  for(const message of ["https://rpc.example/private-key", "Unexpected token in ballot-secret-fixture", "0x"+"ab".repeat(32)]) {
    assert.ok(!safeErrorDetail(new Error(message)).includes(message));
  }
  assert.match(safeErrorDetail(null),/Keep your ballot backup/);
});
test("owned diagnostics and wallet rejection stay actionable",()=>{
  assert.equal(safeErrorDetail(new Error("Deployed bytecode does not match manifest")),"Deployed bytecode does not match manifest");
  for(const code of [4001,"ACTION_REJECTED"]) assert.equal(safeErrorDetail({code}),"Wallet request rejected.");
});
