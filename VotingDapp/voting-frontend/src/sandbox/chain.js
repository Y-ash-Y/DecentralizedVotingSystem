import { createBlock } from "@ethereumjs/block";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createEVM } from "@ethereumjs/evm";
import { MerkleStateManager } from "@ethereumjs/statemanager";
import { createAddressFromString } from "@ethereumjs/util";
import { AbiCoder, getAddress, getBytes, hexlify, randomBytes } from "ethers";

export async function createSandboxChain({ bytecode, codeHash }) {
  const chainId = 31337;
  const common = createCustomCommon({ chainId }, Mainnet, { hardfork: Hardfork.Paris });
  const stateManager = new MerkleStateManager({ common });
  const evm = await createEVM({ common, stateManager });
  // Synthetic identities are used only as EVM message senders. No keys are needed.
  const admin = getAddress(hexlify(randomBytes(20)));
  const voter = getAddress(hexlify(randomBytes(20)));
  const blocks = [];
  const logs = [];
  const receipts = new Map();
  const backups = new Map();
  let clockOffset = 0;
  let tail = Promise.resolve();

  function serial(work) {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  }

  function getSnapshot(tag = "latest") {
    const snapshot = tag === "latest" ? blocks.at(-1) : blocks[Number(tag)];
    if (!snapshot) throw new Error("Sandbox block is unavailable");
    return snapshot;
  }

  function nextBlock(timestamp) {
    const parent = blocks.at(-1)?.block;
    return createBlock({ header: {
      number: BigInt(blocks.length),
      parentHash: parent?.hash(),
      timestamp: BigInt(Math.max(timestamp, Number(parent?.header.timestamp ?? 0n) + 1)),
    } }, { common, skipConsensusFormatValidation: true });
  }

  async function recordBlock(block, entries = []) {
    const root = await stateManager.getStateRoot();
    const number = Number(block.header.number);
    const blockHash = hexlify(block.hash());
    const blockLogs = entries.map(([address, topics, data], index) => ({
      address: hexlify(address), topics: topics.map(hexlify), data: hexlify(data),
      blockNumber: number, index, blockHash, transactionHash: blockHash,
      transactionIndex: 0, removed: false,
    }));
    logs.push(...blockLogs);
    blocks.push({ block, root });
    return blockLogs;
  }

  async function execute(block, from, request, readOnly = false) {
    // Calls and transactions share one interpreter, so isolate warm storage and
    // preserve the committed state even on historical reads or reverts.
    try {
      const result = await evm.runCall({
        block,
        caller: createAddressFromString(from),
        to: request.to ? createAddressFromString(request.to) : undefined,
        data: getBytes(request.data ?? "0x"),
        isStatic: readOnly,
        skipNonceIncrement: readOnly,
      });
      if (result.execResult.exceptionError) {
        throw AbiCoder.getBuiltinCallException(readOnly ? "call" : "sendTransaction",
          { to: request.to ?? null, data: request.data }, hexlify(result.execResult.returnValue));
      }
      return result;
    } finally {
      evm.journal.cleanJournal();
    }
  }

  const now = () => Math.floor(Date.now() / 1000);
  await recordBlock(nextBlock(now()));
  const deployment = nextBlock(now());
  const created = await execute(deployment, admin, { data: bytecode });
  if (!created.createdAddress) throw new Error("Sandbox contract deployment failed");
  const address = getAddress(created.createdAddress.toString());
  await recordBlock(deployment, created.execResult.logs);
  const deploymentBlock = Number(deployment.header.number);

  function runnerFor(account) {
    if (account !== admin && account !== voter) throw new Error("Unknown sandbox account");
    const runner = {
      getNetwork: async () => ({ chainId: BigInt(chainId) }),
      getBlockNumber: async () => Number(getSnapshot().block.header.number),
      getBlock: async tag => {
        const { block } = getSnapshot(tag);
        return { number: Number(block.header.number), timestamp: Number(block.header.timestamp), hash: hexlify(block.hash()) };
      },
      getCode: (target, tag) => serial(async () => {
        const latest = getSnapshot();
        await stateManager.setStateRoot(getSnapshot(tag).root);
        try { return hexlify(await stateManager.getCode(createAddressFromString(target))); }
        finally { await stateManager.setStateRoot(latest.root); }
      }),
      getLogs: async ({ address: target, fromBlock, toBlock }) =>
        logs.filter(log => log.address === target.toLowerCase() && log.blockNumber >= fromBlock && log.blockNumber <= toBlock),
      getTransactionReceipt: async hash => receipts.get(hash) ?? null,
      call: request => serial(async () => {
        const latest = getSnapshot();
        const { root, block } = getSnapshot(request.blockTag);
        await stateManager.setStateRoot(root);
        try { return hexlify((await execute(block, account, request, true)).execResult.returnValue); }
        finally { await stateManager.setStateRoot(latest.root); }
      }),
      sendTransaction: request => serial(async () => {
        if (request.to?.toLowerCase() !== address.toLowerCase() || BigInt(request.value ?? 0) !== 0n) {
          throw new Error("Sandbox transactions can only call the voting contract");
        }
        const parent = getSnapshot();
        const block = nextBlock(now());
        try {
          const result = await execute(block, account, request);
          const blockLogs = await recordBlock(block, result.execResult.logs);
          // Ethers waits for this receipt before exposing a successful write.
          const hash = hexlify(block.hash());
          const blockNumber = Number(block.header.number);
          receipts.set(hash, {
            hash, blockHash: hash, blockNumber, to: request.to, from: account,
            gasUsed: result.execResult.executionGasUsed, logs: blockLogs, status: 1,
          });
          return { hash, blockNumber, blockHash: hash, from: account, to: request.to, data: request.data, value: 0n };
        } catch (error) {
          await stateManager.setStateRoot(parent.root);
          throw error;
        }
      }),
    };
    runner.provider = runner;
    return runner;
  }

  return {
    admin, voter, address, codeHash, deploymentBlock, runnerFor,
    storage: {
      getItem: key => backups.get(key) ?? null,
      setItem: (key, value) => backups.set(key, value),
    },
    advance: (seconds = 0) => serial(async () => {
      clockOffset += seconds;
      const timestamp = now() + clockOffset;
      if (timestamp > Number(getSnapshot().block.header.timestamp)) await recordBlock(nextBlock(timestamp));
    }),
  };
}
