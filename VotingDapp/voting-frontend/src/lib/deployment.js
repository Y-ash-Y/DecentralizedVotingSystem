import { keccak256, Contract } from "ethers";

export async function verifyDeployment(contract, { address, chainId, version, codeHash, fastLocal = false }) {
  const actualChain = (await contract.runner.getNetwork()).chainId;
  if (BigInt(actualChain) !== BigInt(chainId)) throw new Error("Wrong deployment network");
  const code = await contract.runner.getCode(address);
  if (code === "0x") throw new Error("No contract at configured address; check the deployment manifest");
  if (codeHash && keccak256(code).toLowerCase() !== codeHash.toLowerCase()) throw new Error("Deployed bytecode does not match manifest");
  if (version === 2 && Number(await contract.protocolVersion()) !== 2) throw new Error("Contract protocol version mismatch");
  if (fastLocal) {
    if (Number(chainId) !== 31337 || version !== 2) throw new Error("Fast test mode is local-only V2");
    const fixture = new Contract(address, ["function localTestMode() view returns (bool)"], contract.runner);
    if (await fixture.localTestMode() !== true) throw new Error("Expected the fast local test fixture");
  }
}

export const PHASES = ["created", "active", "reveal", "ended", "cancelled"];
export async function enrichElections(contract, elections, viewer) {
  const blockTag = await contract.runner.getBlockNumber();
  const result = [];
  for (let i = 0; i < elections.length; i += 8) {
    result.push(...await Promise.all(elections.slice(i, i + 8).map(async election => {
      const [e, canManage] = await Promise.all([
        contract.getElection(election.id, { blockTag }),
        contract.isElectionAdmin(election.id, viewer, { blockTag }),
      ]);
      if (!PHASES[Number(e.state)]) throw new Error("Unknown election state");
      return { ...election, state: PHASES[Number(e.state)], isSealed: e.isSealed,
        startTime: Number(e.startTime), votingEnd: Number(e.votingEnd), endTime: Number(e.endTime), canManage };
    })));
  }
  return result;
}
