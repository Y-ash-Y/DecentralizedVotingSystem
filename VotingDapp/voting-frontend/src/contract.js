// ── Contract config ───────────────────────────────────────────────────────────
// Address of the deployed VotingSystem contract on Sepolia
import { ABI_V2 } from "./abiV2.js";
import { networkConfig } from "./lib/network.js";
const env = import.meta.env || {};
export const NETWORK = networkConfig(env);
export const PROTOCOL_VERSION = Number(env.VITE_PROTOCOL_VERSION || 1);
if (![1, 2].includes(PROTOCOL_VERSION)) throw new Error("Unsupported VITE_PROTOCOL_VERSION");
export const CONTRACT_ADDRESS = env.VITE_CONTRACT_ADDRESS || "0xBD29A19DBD25bD4d97C09b65862CB7061A9b3011";
export const EXPECTED_CODE_HASH = env.VITE_EXPECTED_CODE_HASH || "";
if (PROTOCOL_VERSION === 2 && (!env.VITE_CONTRACT_ADDRESS || !EXPECTED_CODE_HASH || !env.VITE_DEPLOYMENT_BLOCK)) {
  throw new Error("V2 requires an address, deployment block and bytecode hash from its deployment manifest");
}

// ABI matches Voting.sol exactly.
// IMPORTANT: None of the event parameters are `indexed` in the deployed contract.
// Filtering by topic (e.g. filters.CandidateAdded(electionId)) is therefore not
// supported by ethers v6. Always call queryFilter with no arguments and filter
// the results by electionId in JavaScript.
export const LEGACY_ABI = [
  // ── State reads ──
  "function superAdmin() view returns (address)",
  "function electionCount() view returns (uint)",

  // ── Admin writes ──
  "function createElection(string memory _name, uint _startTime, uint _endTime, bool _commitReveal)",
  "function assignAdmin(uint _electionId, address _admin)",
  "function addCandidate(uint _electionId, string memory _name)",
  "function addCandidates(uint _electionId, string[] memory _names)",
  "function authorizeVoter(uint _electionId, address _voter)",
  "function authorizeVoters(uint _electionId, address[] memory _voters)",
  "function startElection(uint _electionId)",
  "function startReveal(uint _electionId)",
  "function endElection(uint _electionId)",

  // ── Voter writes ──
  "function vote(uint _electionId, uint _candidateId)",
  "function commitVote(uint _electionId, bytes32 _commitment)",
  "function revealVote(uint _electionId, uint _candidateId, string memory _secret)",

  // ── Result read (only after election ends) ──
  "function getCandidateVotes(uint _electionId, uint _candidateId) view returns (uint)",

  // ── Events — NO indexed parameters (matches deployed contract) ──
  // Do NOT add `indexed` here; it would cause topic-filter mismatches.
  "event ElectionCreated(uint electionId, string name, bool commitReveal)",
  "event AdminAssigned(uint electionId, address admin)",
  "event CandidateAdded(uint electionId, uint candidateId, string name)",
  "event VoterAuthorized(uint electionId, address voter)",
  "event VoteCast(uint electionId, address voter)",
  "event VoteCommitted(uint electionId, address voter)",
  "event VoteRevealed(uint electionId, address voter)",
  "event ElectionStarted(uint electionId)",
  "event RevealStarted(uint electionId)",
  "event ElectionEnded(uint electionId)",
];
export const CONTRACT_ABI = PROTOCOL_VERSION === 2 ? ABI_V2 : LEGACY_ABI;

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX      = "0xaa36a7";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
export const SEPOLIA_RPC      = "https://rpc.sepolia.org";
