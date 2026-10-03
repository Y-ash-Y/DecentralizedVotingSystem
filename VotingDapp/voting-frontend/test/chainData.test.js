import test from "node:test";
import assert from "node:assert/strict";
import { queryLogsPaged, findDeploymentBlock, createEventReader, loadResults } from "../src/lib/chainData.js";

test("pagination includes creation events older than 500,000 blocks without gaps", async () => {
  const ranges = [];
  const provider = { getLogs: async ({ fromBlock, toBlock }) => {
    ranges.push([fromBlock, toBlock]);
    return fromBlock === 12 ? [{ blockNumber: 12, index: 0 }] : [];
  } };
  const logs = await queryLogsPaged(provider, "address", 12, 600_012, { pageSize: 100_000 });
  assert.equal(logs.length, 1);
  assert.deepEqual(ranges[0], [12, 100_011]);
  assert.deepEqual(ranges.at(-1), [600_012, 600_012]);
  ranges.slice(1).forEach((range, i) => assert.equal(range[0], ranges[i][1] + 1));
});
test("provider range limits shrink page size without losing events", async () => {
  const provider = { getLogs: async ({ fromBlock, toBlock }) => {
    if (toBlock - fromBlock > 1) throw new Error("block range limit");
    return Array.from({ length: toBlock - fromBlock + 1 }, (_, i) => ({ blockNumber: fromBlock + i, index: 0 }));
  } };
  const logs = await queryLogsPaged(provider, "a", 0, 9, { pageSize: 8 });
  assert.deepEqual(logs.map(log => log.blockNumber), Array.from({ length: 10 }, (_, i) => i));
});
test("outages reject partial scans and are not retried as smaller ranges", async () => {
  let calls = 0;
  await assert.rejects(queryLogsPaged({ getLogs: async () => { calls++; throw new Error("401 unauthorized"); } }, "a", 0, 10), /Unable to read/);
  assert.equal(calls, 1);
});
test("request budget prevents unbounded provider calls", async () => {
  await assert.rejects(queryLogsPaged({ getLogs: async () => [] }, "a", 0, 100, { pageSize: 1, maxRequests: 2 }), /budget/);
});
test("invalid query bounds fail immediately", async () => {
  await assert.rejects(queryLogsPaged({}, "a", -1, 10), /bounds/);
});
test("deployment discovery finds first code block in logarithmic calls", async () => {
  let calls = 0;
  assert.equal(await findDeploymentBlock({ getCode: async (_, block) => { calls++; return block < 765 ? "0x" : "0x1234"; } }, "a", 1_000_000), 765);
  assert.ok(calls < 25);
});
test("wrong network/address with no bytecode is rejected", async () => {
  await assert.rejects(findDeploymentBlock({ getCode: async () => "0x" }, "a", 100), /No voting contract/);
});
test("unavailable historical state has actionable error", async () => {
  await assert.rejects(findDeploymentBlock({ getCode: async (_, block) => {
    if (block < 100) throw new Error("pruned");
    return "0x1234";
  } }, "a", 100), /VITE_DEPLOYMENT_BLOCK/);
});

function fakeContract() {
  let calls = 0;
  const contract = {
    runner: {
      getNetwork: async () => ({ chainId: 11155111n }),
      getBlockNumber: async () => 20,
      getBlock: async () => ({ hash: "stable" }),
      getCode: async (_, block) => block < 5 ? "0x" : "0x1234",
      getLogs: async ({ fromBlock, toBlock }) => { calls++; return fromBlock <= 5 && toBlock >= 5 ? [{ blockNumber: 5, index: 0 }] : []; },
    },
    interface: { parseLog: () => ({ name: "ElectionCreated", args: { electionId: 1n } }) },
    electionCount: async () => 1n,
  };
  return { contract, calls: () => calls };
}
test("concurrent readers share one scan and writes invalidate the cache", async () => {
  const { contract, calls } = fakeContract();
  const reader = createEventReader({ address: "a", deploymentBlock: 5 });
  const [a, b] = await Promise.all([reader.read(contract), reader.read(contract)]);
  assert.deepEqual(a, b); assert.equal(calls(), 1);
  await reader.read(contract); assert.equal(calls(), 1);
  reader.invalidate(); await reader.read(contract); assert.equal(calls(), 2);
});
test("deployment override must not omit earlier history", async () => {
  const { contract } = fakeContract();
  await assert.rejects(createEventReader({ address: "a", deploymentBlock: 6 }).read(contract), /Incomplete election history/);
});
test("incremental refresh preserves ancient events and queries only after its checkpoint", async () => {
  const { contract } = fakeContract();
  const reader = createEventReader({ address: "a", deploymentBlock: 5 });
  await reader.read(contract); reader.invalidate();
  let queriedFrom;
  contract.runner.getLogs = async ({ fromBlock }) => { queriedFrom = fromBlock; return [{ blockNumber: 21, index: 0 }]; };
  contract.runner.getBlockNumber = async () => 21;
  contract.electionCount = async () => 2n;
  const events = await reader.read(contract);
  assert.equal(queriedFrom, 9);
  assert.deepEqual(events.map(e => e.blockNumber), [5, 21]);
});
test("a deep reorg discards the prefix and rescans from deployment", async () => {
  const { contract } = fakeContract();
  const reader = createEventReader({ address: "a", deploymentBlock: 5 });
  await reader.read(contract); reader.invalidate();
  contract.runner.getBlock = async () => ({ hash: "new-chain" });
  let queriedFrom;
  contract.runner.getLogs = async ({ fromBlock }) => { queriedFrom = fromBlock; return []; };
  contract.electionCount = async () => 0n;
  assert.deepEqual(await reader.read(contract), []);
  assert.equal(queriedFrom, 5);
});
test("explicit block supports providers without historical code reads", async () => {
  const { contract } = fakeContract();
  contract.runner.getCode = async (_, block) => {
    if (block !== 20) throw new Error("historical code unavailable");
    return "0x1234";
  };
  const result = await createEventReader({ address: "a", deploymentBlock: 5 }).read(contract);
  assert.equal(result.length, 1);
});
test("a reorganization during a scan is rejected rather than cached", async () => {
  const { contract } = fakeContract(); let blocks = 0;
  contract.runner.getBlock = async () => ({ hash: ++blocks === 1 ? "old" : "new" });
  await assert.rejects(createEventReader({ address: "a" }).read(contract), /Chain changed/);
});
test("ABI mismatch is not presented as an empty election list", async () => {
  const { contract } = fakeContract();
  contract.interface.parseLog = () => null;
  await assert.rejects(createEventReader({ address: "a" }).read(contract), /ABI/);
});
test("results preserve genuine zero and use a single block snapshot", async () => {
  const { contract } = fakeContract();
  contract.getCandidateVotes = async (election, candidate, options) => {
    assert.equal(election, 1n); assert.equal(options.blockTag, 20);
    return candidate === 1n ? 0n : 7n;
  };
  const result = await loadResults(contract, "1", [{ id: "1" }, { id: "2" }]);
  assert.deepEqual(result.map(r => r.votes), [0, 7]);
});
test("failed candidate read rejects the entire tally instead of inventing a zero", async () => {
  const { contract } = fakeContract();
  contract.getCandidateVotes = async (_, candidate) => {
    if (candidate === 2n) throw new Error("RPC unavailable");
    return 4n;
  };
  await assert.rejects(loadResults(contract, "1", [{ id: "1" }, { id: "2" }]), /RPC unavailable/);
});
test("results refuse lossy integer conversion", async () => {
  const { contract } = fakeContract();
  contract.getCandidateVotes = async () => BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  await assert.rejects(loadResults(contract, "1", [{ id: "1" }]), /safely/);
});
test("result fetching caps concurrent reads at eight", async () => {
  const { contract } = fakeContract(); let active = 0, peak = 0;
  contract.getCandidateVotes = async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--; return 1n;
  };
  await loadResults(contract, "1", Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1) })));
  assert.equal(peak, 8);
});
