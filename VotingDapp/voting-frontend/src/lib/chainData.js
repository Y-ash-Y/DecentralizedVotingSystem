// Read all history, never a rolling window. Requests are sequential and bounded
// to avoid flooding a public RPC. Any incomplete scan is an error, not empty data.
export async function queryLogsPaged(provider, address, fromBlock, toBlock, {
  pageSize = 10_000, maxRequests = 20_000, maxLogs = 250_000,
} = {}) {
  if (![fromBlock, toBlock, pageSize, maxRequests, maxLogs].every(Number.isSafeInteger) ||
      fromBlock < 0 || toBlock < 0 || pageSize < 1 || maxRequests < 1 || maxLogs < 1) {
    throw new Error("Invalid event query bounds");
  }
  const logs = [];
  let calls = 0;
  let width = pageSize;
  for (let start = fromBlock; start <= toBlock;) {
    if (++calls > maxRequests) throw new Error("Event scan exceeded its request budget. Use an indexed RPC service.");
    const end = Math.min(toBlock, start + width - 1);
    let page;
    try {
      page = await provider.getLogs({ address, fromBlock: start, toBlock: end });
    } catch (error) {
      // Providers use differing nested error codes; only range/result-size errors
      // justify shrinking. Authentication, outages and rate limits fail explicitly.
      const message = [error.message, error.error?.message, error.info?.error?.message].filter(Boolean).join(" ");
      if (width > 1 && /block range|too many (results|logs)|response size|query returned more|limit.*(block|range)|range.*limit/i.test(message)) {
        width = Math.max(1, Math.floor(width / 2));
        continue;
      }
      throw new Error(`Unable to read event blocks ${start}-${end}. Retry or change RPC provider.`, { cause: error });
    }
    if (!Array.isArray(page) || logs.length + page.length > maxLogs) throw new Error("Event history exceeds the browser limit. Use an indexed service.");
    for (const log of page) logs.push(log); // Avoid argument-count overflow on large RPC pages.
    start = end + 1;
  }
  return logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
}

// This project's contract is immutable, with no self-destruct/redeployment path.
// Under that assumption code existence is monotonic, permitting binary search.
export async function findDeploymentBlock(provider, address, latest) {
  if (await provider.getCode(address, latest) === "0x") throw new Error("No voting contract exists at this address on the selected network.");
  let low = 0, high = latest;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    let code;
    try { code = await provider.getCode(address, middle); }
    catch (error) {
      throw new Error("RPC cannot read historical code. Set VITE_DEPLOYMENT_BLOCK to the deployment receipt's block number.", { cause: error });
    }
    if (code === "0x") low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createEventReader({ address, deploymentBlock, ttlMs = 12_000 }) {
  if (deploymentBlock !== undefined && (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0)) {
    throw new Error("VITE_DEPLOYMENT_BLOCK must be a non-negative integer");
  }
  let cache, inflight, generation = 0;
  return {
    // Keep a verified prefix for incremental scans, but never serve it as fresh.
    invalidate() { generation++; if (cache) cache.time = 0; inflight = undefined; },
    async read(contract) {
      const provider = contract.runner;
      const chain = String((await provider.getNetwork()).chainId);
      if (cache?.chain === chain && Date.now() - cache.time < ttlMs) return cache.events;
      if (inflight?.chain === chain) return inflight.promise;
      const currentGeneration = generation;
      const promise = (async () => {
        const latest = await provider.getBlockNumber();
        const snapshot = await provider.getBlock(latest);
        const previous = cache?.chain === chain ? cache : undefined;
        const start = previous?.start ?? deploymentBlock ?? await findDeploymentBlock(provider, address, latest);
        if (start > latest) throw new Error("Deployment block is newer than the chain tip");
        // An explicit deployment block avoids historical getCode requests on
        // non-archive providers. Verify completeness against electionCount below.
        if (deploymentBlock !== undefined && await provider.getCode(address, latest) === "0x") {
          throw new Error("No voting contract exists at this address on the selected network.");
        }
        // Recheck the retained prefix against the current chain. Re-scan the last
        // 12 blocks on every refresh; a deeper reorg invalidates the whole prefix.
        const canReuse = previous && latest >= previous.anchor &&
          (await provider.getBlock(previous.anchor))?.hash === previous.anchorHash;
        const scanStart = canReuse ? Math.max(start, previous.anchor + 1) : start;
        const logs = await queryLogsPaged(provider, address, scanStart, latest);
        const after = await provider.getBlock(latest);
        if (!snapshot?.hash || after?.hash !== snapshot.hash) throw new Error("Chain changed during event scan; refresh to retry.");
        const freshEvents = logs.map(log => {
          const parsed = contract.interface.parseLog(log);
          if (!parsed) throw new Error("Event does not match the configured contract ABI");
          return { ...log, name: parsed.name, args: parsed.args };
        });
        const events = [...(canReuse ? previous.events.filter(e => e.blockNumber <= previous.anchor) : []), ...freshEvents];
        if (events.length > 250_000) throw new Error("Event history exceeds the browser limit. Use an indexed service.");
        const electionCount = await contract.electionCount({ blockTag: latest });
        if (BigInt(events.filter(e => e.name === "ElectionCreated").length) !== BigInt(electionCount)) {
          throw new Error("Incomplete election history. Check the deployment block and RPC provider.");
        }
        const anchor = Math.max(0, latest - 12);
        const anchorHash = (await provider.getBlock(anchor))?.hash;
        if (!anchorHash) throw new Error("Could not verify event checkpoint");
        if ((await provider.getBlock(latest))?.hash !== snapshot.hash) throw new Error("Chain changed before event checkpoint; refresh to retry.");
        if (generation === currentGeneration) cache = { chain, events, start, anchor, anchorHash, time: Date.now() };
        return events;
      })();
      inflight = { chain, promise };
      try { return await promise; }
      finally { if (inflight?.promise === promise) inflight = undefined; }
    },
  };
}

export async function loadResults(contract, electionId, candidates) {
  const blockTag = await contract.runner.getBlockNumber();
  const snapshot = await contract.runner.getBlock(blockTag);
  const results = [];
  // Cap parallel eth_call requests while ensuring one consistent block snapshot.
  for (let i = 0; i < candidates.length; i += 8) {
    results.push(...await Promise.all(candidates.slice(i, i + 8).map(async candidate => {
      const votes = await contract.getCandidateVotes(BigInt(electionId), BigInt(candidate.id), { blockTag });
      if (votes < 0n || votes > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Vote total cannot be displayed safely as a JavaScript number");
      return { ...candidate, votes: Number(votes) };
    })));
  }
  if (!snapshot?.hash || (await contract.runner.getBlock(blockTag))?.hash !== snapshot.hash) {
    throw new Error("Chain changed while loading results; retry.");
  }
  const total = results.reduce((sum, row) => sum + BigInt(row.votes), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Total votes cannot be displayed safely as a JavaScript number");
  return results; // Reject the entire result on any failure; never invent zero votes.
}
