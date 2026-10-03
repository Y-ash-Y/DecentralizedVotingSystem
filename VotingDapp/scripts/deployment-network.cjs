// Check before creating a signed transaction: a network name alone is not proof
// that a configured RPC endpoint serves the intended chain.
function assertDeploymentNetwork(name, chainId) {
  const expected = { hardhat: 31337, localhost: 31337, sepolia: 11155111 }[name];
  if (!expected || BigInt(chainId) !== BigInt(expected)) {
    throw new Error("Deployment network identity mismatch");
  }
}
module.exports = { assertDeploymentNetwork };
