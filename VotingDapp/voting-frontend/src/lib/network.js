// Only reviewed networks are accepted. Local wallet testing must be explicit and
// cannot accidentally become a production build pointing at a development node.
export function networkConfig(env = {}) {
  const chainId = Number(env.VITE_CHAIN_ID || 11155111);
  if (chainId === 31337) {
    if (env.DEV !== true || env.VITE_LOCAL_DEMO !== "true") {
      throw new Error("Local demo requires development mode and VITE_LOCAL_DEMO=true");
    }
    return { chainId, hex:"0x7a69", name:"VoteChain Local Demo", symbol:"ETH",
      rpc:"http://127.0.0.1:8545", explorer:"", local:true, fastLocal:env.VITE_FAST_LOCAL_TEST === "true" };
  }
  if (chainId !== 11155111) throw new Error("Only Sepolia and explicit local demo are supported");
  if (env.VITE_FAST_LOCAL_TEST === "true") throw new Error("Fast test mode is local-only");
  return { chainId, hex:"0xaa36a7", name:"Sepolia", symbol:"ETH",
    rpc:"https://rpc.sepolia.org", explorer:"https://sepolia.etherscan.io", local:false };
}
