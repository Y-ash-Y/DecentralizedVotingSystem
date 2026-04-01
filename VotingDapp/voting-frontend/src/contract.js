// ── Contract config ──────────────────────────────────────────────────────────
export const CONTRACT_ADDRESS = "0xa4659c5Bce9aA467b12C0805c3ab32f03378C67C";

export const CONTRACT_ABI = [
  "function superAdmin() view returns (address)",
  "function electionCount() view returns (uint)",
  "function createElection(string memory _name, uint _startTime, uint _endTime)",
  "function assignAdmin(uint _electionId, address _admin)",
  "function addCandidate(uint _electionId, string memory _name)",
  "function authorizeVoter(uint _electionId, address _voter)",
  "function startElection(uint _electionId)",
  "function endElection(uint _electionId)",
  "function vote(uint _electionId, uint _candidateId)",
  "function getCandidateVotes(uint _electionId, uint _candidateId) view returns (uint)",
  "event ElectionCreated(uint indexed electionId, string name)",
  "event AdminAssigned(uint indexed electionId, address admin)",
  "event CandidateAdded(uint indexed electionId, uint candidateId, string name)",
  "event VoterAuthorized(uint indexed electionId, address voter)",
  "event VoteCast(uint indexed electionId, address voter)",
  "event ElectionStarted(uint indexed electionId)",
  "event ElectionEnded(uint indexed electionId)",
];

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX      = "0xaa36a7";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
export const SEPOLIA_RPC      = "https://rpc.sepolia.org";
