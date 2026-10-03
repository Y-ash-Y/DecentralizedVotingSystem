// Exact contract-owned reasons only: even short provider reasons can contain secrets.
const contractReasons = new Set([
  "Not super admin", "Not election admin", "Election does not exist",
  "Invalid time range", "Election already started", "Not a commit-reveal election",
  "Invalid state", "Reveal not started", "Election not active", "Use commit-reveal voting",
  "Not authorized", "Already voted", "Invalid candidate", "Commit phase closed",
  "Already committed", "Not in reveal phase", "No commitment found", "Already revealed",
  "Reveal does not match commitment", "Results not available yet", "Invalid successor",
  "Not pending super admin", "Zero address", "Start must be in future", "Voting phase too short",
  "Reveal phase too short", "Plain end must equal voting end", "Name must be 1-100 bytes",
  "Blank name", "Setup closed", "Invalid batch size", "Candidate limit", "Duplicate candidate",
  "Incomplete setup", "Already reported", "Election not ended", "Empty commitment",
]);

// Do not stringify wallet/RPC errors: they may include URLs, calldata or secrets.
export function transactionError(error) {
  if (error?.code === "PHASE_MINIMUM" && typeof error.minimum === "bigint" && error.minimum > 0n && error.minimum <= 31_536_000n) {
    return `This deployed contract requires ${error.minimum} seconds per phase. Shorter windows require a new deployment.`;
  }
  if (error?.code === "START_NOT_FUTURE") return "Choose a start after the latest chain timestamp.";
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "Wallet request rejected. No new confirmation was received; your ballot backup is preserved.";
  if (error?.code === "INSUFFICIENT_FUNDS") return "Insufficient test-network ETH for gas.";
  if (error?.code === "TRANSACTION_REPLACED") return "Transaction cancelled or replaced. Check wallet history before retrying; your backup is preserved.";
  if (error?.code === "WALLET_CHANGED") return "Wallet account changed. Reconnect the intended account before submitting.";
  if (error?.code === "RECEIPT_FAILED") return "Transaction was not confirmed successfully. Check wallet history before retrying.";
  if (contractReasons.has(error?.reason)) return error.reason;
  return "Transaction could not be confirmed. Check the wallet for rejection, pending status or a revert before retrying. Keep your backup.";
}

export async function confirmedReceipt(transaction) {
  let receipt;
  try { receipt = await transaction.wait(); }
  catch (error) {
    // Ethers reports a successful speed-up as an exception. Accept only an
    // equivalent repricing, never cancellation or a different replacement call.
    const replacement = error?.replacement;
    const equivalent = replacement && replacement.to?.toLowerCase() === transaction.to?.toLowerCase() &&
      replacement.data === transaction.data && BigInt(replacement.value ?? 0) === BigInt(transaction.value ?? 0);
    if (error?.code !== "TRANSACTION_REPLACED" || error.cancelled || error.reason !== "repriced" || !equivalent) throw error;
    receipt = error.receipt;
  }
  if (!receipt || Number(receipt.status) !== 1) throw Object.assign(new Error("Receipt did not succeed"), {code:"RECEIPT_FAILED"});
  return receipt;
}
