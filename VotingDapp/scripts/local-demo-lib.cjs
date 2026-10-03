const { isAddress, getAddress, ZeroAddress } = require("ethers");
function participants(admin,voter) {
  for(const address of [admin,voter]) {
    if(!isAddress(address)||address.toLowerCase()===ZeroAddress) throw new Error("Two non-zero public wallet addresses are required");
  }
  if(admin.toLowerCase()===voter.toLowerCase())throw new Error("Use different admin and voter wallets");
  return {admin:getAddress(admin),voter:getAddress(voter)};
}
async function assertLocalNode(provider, rpcUrl = provider.connection.url) {
  const connection = new URL(rpcUrl);
  if(connection.origin!=="http://127.0.0.1:8545" || connection.pathname!=="/" || connection.username || connection.password || connection.search || connection.hash) throw new Error("Loopback-only demo RPC required");
  if(BigInt((await provider.getNetwork()).chainId)!==31337n)throw new Error("Local chain 31337 required");
  const metadata=await provider.send("hardhat_metadata",[]);
  // Recent Hardhat releases identify their execution engine as EDR.
  if(!/^(hardhat|edr\/)/i.test(metadata.clientVersion||"")||!metadata.instanceId||metadata.forkedNetwork)throw new Error("An unforked disposable Hardhat node is required");
  return metadata;
}
function phaseTimestamp(election,phase,current) {
  if(!election.isSealed)throw new Error("Seal the setup in the browser first");
  if(phase==="reveal"&&!election.commitReveal)throw new Error("Plain elections have no reveal phase");
  const value={active:election.startTime,reveal:election.votingEnd,ended:election.endTime}[phase];
  if(value===undefined)throw new Error("Phase must be active, reveal or ended");
  const target=Number(value);
  if(!Number.isSafeInteger(target)||target<=current)throw new Error("Target deadline has already passed; local chain time cannot go backward");
  return target;
}
module.exports={participants,assertLocalNode,phaseTimestamp};
