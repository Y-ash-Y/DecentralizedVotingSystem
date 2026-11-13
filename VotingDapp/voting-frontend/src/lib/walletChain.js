import { toQuantity } from "ethers";

export async function assertWalletChain(wallet, chainId) {
  const actual = await wallet.request({ method: "eth_chainId" });
  if (actual !== toQuantity(chainId)) {
    throw Object.assign(new Error("Wallet network changed"), { code: 4901 });
  }
}

export function chainBoundWallet(wallet, chainId, onApproval) {
  return {
    async request(payload) {
      if (payload.method !== "eth_sendTransaction") return wallet.request(payload);
      // Check at the RPC boundary, after ethers has acquired the signer and
      // estimated gas. Also send the intended chain to the wallet.
      await assertWalletChain(wallet, chainId);
      onApproval?.();
      return wallet.request({
        method: payload.method,
        params: [{ ...payload.params[0], chainId: toQuantity(chainId) }],
      });
    },
  };
}
