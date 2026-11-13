import assert from "node:assert/strict";
import test from "node:test";
import { BrowserProvider, Contract } from "ethers";
import { chainBoundWallet } from "../src/lib/walletChain.js";
import { transactionError } from "../src/lib/transactions.js";

const chainId = 11155111;
const account = "0x00000000000000000000000000000000000000a1";
const address = "0x00000000000000000000000000000000000000b2";

for (const switchDuringEstimate of [true, false]) {
  test(switchDuringEstimate ? "blocks a network switch after gas estimation" :
    "sends the expected chain ID with the wallet transaction", async () => {
    let activeChain = "0xaa36a7";
    const submissions = [];
    const wallet = {
      async request({ method, params }) {
        switch (method) {
          case "eth_chainId": return activeChain;
          case "eth_accounts": return [account];
          case "eth_blockNumber": return "0x10";
          case "eth_estimateGas":
            if (switchDuringEstimate) activeChain = "0x1";
            return "0x5208";
          case "eth_sendTransaction":
            submissions.push(params[0]);
            throw Object.assign(new Error("Rejected in test"), { code: 4001 });
          default: throw new Error(`Unexpected RPC method: ${method}`);
        }
      },
    };
    const provider = new BrowserProvider(chainBoundWallet(wallet, chainId), chainId);
    try {
      const signer = await provider.getSigner();
      const contract = new Contract(address, ["function addCandidate(uint256,string)"], signer);
      await assert.rejects(contract.addCandidate(1, "Alice"), error => switchDuringEstimate
        ? transactionError(error).startsWith("Wallet network changed.") : error.code === "ACTION_REJECTED");
      assert.equal(submissions.length, switchDuringEstimate ? 0 : 1);
      if (!switchDuringEstimate) assert.equal(submissions[0].chainId, "0xaa36a7");
    } finally {
      provider.destroy();
    }
  });
}
