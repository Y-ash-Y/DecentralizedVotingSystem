import { AbiCoder, id, keccak256, hexlify, randomBytes, solidityPackedKeccak256 } from "ethers";

// Compatible with the existing deployed contract. This is delayed disclosure,
// not an anonymous ballot: the reveal transaction publishes the choice.
export const generateSecret = () => hexlify(randomBytes(32));
export function commitmentHash(candidateId, secret, voter, domain) {
  if (!domain) return solidityPackedKeccak256(["uint256", "string", "address"], [BigInt(candidateId), secret, voter]);
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "address", "uint256", "address", "uint256", "bytes32"],
    [id("VoteChainCommitment(uint256 chainId,address verifyingContract,uint256 electionId,address voter,uint256 candidateId,bytes32 secret)"),
      domain.chainId, domain.contract, domain.electionId, voter, candidateId, secret]
  ));
}

// Preserve the existing key format so already-committed ballots remain recoverable.
export const commitmentKey = (contract, electionId, voter) =>
  `vc_cr_${contract}_${electionId}_${voter.toLowerCase()}`;

export function loadCommitment(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value.secret !== "string" || !value.secret.length ||
      !/^[1-9][0-9]*$/.test(String(value.candidateId))) {
    throw new Error("Saved ballot is invalid. Restore your candidate and secret from your backup.");
  }
  return { candidateId: String(value.candidateId), secret: value.secret };
}

export function prepareCommitment(storage, key, candidateId, voter, domain) {
  // Never overwrite a pending ballot: a timeout does not prove its transaction failed.
  const saved = loadCommitment(storage, key);
  if (saved && saved.candidateId !== String(candidateId)) {
    throw new Error("A ballot backup already exists for another candidate. Load it and check the transaction before proceeding.");
  }
  const ballot = saved || { candidateId: String(candidateId), secret: generateSecret() };
  const hash = commitmentHash(ballot.candidateId, ballot.secret, voter, domain);
  storage.setItem(key, JSON.stringify(ballot));
  const verified = loadCommitment(storage, key);
  if (!verified || verified.secret !== ballot.secret || verified.candidateId !== ballot.candidateId) {
    throw new Error("Could not save your reveal backup. No transaction was requested.");
  }
  return { ...ballot, hash };
}
