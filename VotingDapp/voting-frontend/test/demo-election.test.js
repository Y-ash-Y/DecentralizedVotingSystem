import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../demo/election.js";

test("sandbox seals eligibility and verifies one reveal against the original commitment", () => {
  let election = applyAction(null, "admin", { type: "create", name: "Example" });
  const act = (actor, type, payload) => { election = applyAction(election, actor, { type, ...payload }); };
  assert.throws(() => act("admin", "seal"), /Register candidates/);
  act("admin", "candidates", { names: ["Alice", "Bob"] });
  act("admin", "enroll");
  act("admin", "seal");
  assert.throws(() => act("admin", "candidates", { names: ["A", "B"] }), /closed/);
  act("admin", "advance");
  assert.throws(() => act("admin", "commit", { choice: 1 }), /enrolled voter/);
  act("voter", "commit", { choice: 1 });
  assert.match(election.hash, /^0x[0-9a-f]{64}$/);
  assert.equal(election.vote, null);
  assert.throws(() => act("voter", "commit", { choice: 2 }), /once/);
  act("voter", "advance");
  assert.throws(() => act("voter", "reveal", { backup: { ...election.backup, choice: 2 } }), /does not match/);
  act("voter", "reveal", { backup: election.backup });
  assert.throws(() => act("voter", "reveal", { backup: election.backup }), /once/);
  act("voter", "advance");
  assert.equal(election.phase, "results");
  assert.equal(election.vote, 1);
});
