import test from "node:test";
import assert from "node:assert/strict";
import { generateSecret, commitmentHash, commitmentKey, loadCommitment, prepareCommitment } from "../src/lib/commitments.js";

const voter = "0x0000000000000000000000000000000000000001";
const other = "0x0000000000000000000000000000000000000002";
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test("new secrets use 32 random bytes, encoded as hex", () => {
  const secret = generateSecret();
  assert.match(secret, /^0x[0-9a-f]{64}$/);
  assert.notEqual(secret, generateSecret());
});
test("commitments bind both candidate and sender", () => {
  const hash = commitmentHash("1", "secret", voter);
  assert.notEqual(hash, commitmentHash("2", "secret", voter));
  assert.notEqual(hash, commitmentHash("1", "secret", other));
  assert.equal(hash, commitmentHash(1n, "secret", voter));
});
test("retry after cancellation or timeout reuses the saved ballot", () => {
  const storage = memory();
  const ballot = prepareCommitment(storage, "key", "1", voter);
  assert.deepEqual(prepareCommitment(storage, "key", "1", voter), ballot);
  assert.equal(loadCommitment(storage, "key").secret, ballot.secret);
});
test("existing pending ballots cannot be silently overwritten", () => {
  const storage = memory();
  const ballot = prepareCommitment(storage, "key", "1", voter);
  assert.throws(() => prepareCommitment(storage, "key", "2", voter), /already exists/);
  assert.equal(loadCommitment(storage, "key").secret, ballot.secret);
});
test("storage denial blocks commitment preparation", () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.throws(() => prepareCommitment(storage, "key", "1", voter), /quota/);
});
test("silently dropped storage writes block commitment preparation", () => {
  assert.throws(() => prepareCommitment({ getItem: () => null, setItem: () => {} }, "key", "1", voter), /Could not save/);
});
test("old-format backups with manually chosen secrets remain recoverable", () => {
  const storage = memory();
  storage.setItem("key", JSON.stringify({ candidateId: "3", secret: "legacy phrase" }));
  assert.equal(loadCommitment(storage, "key").secret, "legacy phrase");
});
test("corrupt backups fail explicitly", () => {
  const storage = memory();
  storage.setItem("key", "not json");
  assert.throws(() => loadCommitment(storage, "key"));
  storage.setItem("key", JSON.stringify({ candidateId: 0, secret: "" }));
  assert.throws(() => loadCommitment(storage, "key"), /invalid/);
});
test("backup keys separate voters, elections and deployments", () => {
  const base = commitmentKey(voter, "1", voter);
  assert.notEqual(base, commitmentKey(voter, "2", voter));
  assert.notEqual(base, commitmentKey(voter, "1", other));
  assert.notEqual(base, commitmentKey(other, "1", voter));
});
