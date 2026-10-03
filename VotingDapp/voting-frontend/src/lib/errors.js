// Only application-owned messages may reach the interface. Wallet/RPC errors and
// malformed backup JSON can contain credentials, calldata or ballot material.
const safeMessages = new Set([
  "User rejected connection", "Network switch rejected",
  "Wrong deployment network", "No contract at configured address; check the deployment manifest",
  "Deployed bytecode does not match manifest", "Contract protocol version mismatch",
  "Expected the fast local test fixture", "Unknown election state",
  "No voting contract exists at this address on the selected network.",
  "Deployment block is newer than the chain tip",
  "Incomplete election history. Check the deployment block and RPC provider.",
  "Event history exceeds the browser limit. Use an indexed service.",
  "Event scan exceeded its request budget. Use an indexed RPC service.",
  "Chain changed during event scan; refresh to retry.",
  "Chain changed before event checkpoint; refresh to retry.",
  "Chain changed while loading results; retry.",
  "Saved ballot is invalid. Restore your candidate and secret from your backup.",
  "A ballot backup already exists for another candidate. Load it and check the transaction before proceeding.",
  "Could not save your reveal backup. No transaction was requested.",
  "No saved ballot; submit a commitment first.",
]);

export function safeErrorDetail(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "Wallet request rejected.";
  return safeMessages.has(error?.message) ? error.message :
    "Check the wallet network, connection and browser storage, then retry. Keep your ballot backup.";
}
