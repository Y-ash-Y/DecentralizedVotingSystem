// SPDX-License-Identifier: MPL-2.0
pragma solidity ^0.8.20;

/// @notice Educational scheduled voting. Reveals are public, not anonymous ballots.
/// @dev Versioned separately: this contract does not migrate or mutate V1 elections.
contract VotingSystemV2 {
    uint public constant protocolVersion = 2;
    uint public constant MIN_PHASE_DURATION = 1 seconds;
    uint public constant MAX_BATCH = 50;
    uint public constant MAX_CANDIDATES = 100;
    bytes32 public constant COMMITMENT_TYPEHASH = keccak256(
        "VoteChainCommitment(uint256 chainId,address verifyingContract,uint256 electionId,address voter,uint256 candidateId,bytes32 secret)"
    );

    address public superAdmin;
    address public pendingSuperAdmin;
    uint public electionCount;
    enum ElectionState { Created, Active, Reveal, Ended, Cancelled }
    struct Candidate { uint id; string name; uint voteCount; }
    struct Voter { bool isAuthorized; bool hasVoted; bool hasCommitted; bytes32 commitment; }
    struct Election {
        string name;
        uint startTime;
        uint votingEnd;
        uint endTime;
        bool commitReveal;
        bool setupSealed;
        bool cancelled;
        bool revealReported;
        bool endReported;
        uint candidateCount;
        uint voterCount;
        mapping(uint => Candidate) candidates;
        mapping(bytes32 => bool) names;
        mapping(address => Voter) voters;
        mapping(address => bool) admins;
    }
    mapping(uint => Election) private elections;

    event ElectionCreated(uint indexed electionId, string name, bool commitReveal);
    event AdminAssigned(uint indexed electionId, address indexed admin);
    event AdminRevoked(uint indexed electionId, address indexed admin);
    event CandidateAdded(uint indexed electionId, uint candidateId, string name);
    event VoterAuthorized(uint indexed electionId, address indexed voter);
    event VoterRevoked(uint indexed electionId, address indexed voter);
    event VoteCast(uint indexed electionId, address indexed voter);
    event VoteCommitted(uint indexed electionId, address indexed voter);
    event VoteRevealed(uint indexed electionId, address indexed voter);
    event ElectionStarted(uint indexed electionId); // Setup sealed; startTime still gates voting.
    event RevealStarted(uint indexed electionId);   // Optional marker, not a state transition.
    event ElectionEnded(uint indexed electionId);   // Optional marker, not a state transition.
    event ElectionCancelled(uint indexed electionId);
    event SuperAdminTransferProposed(address indexed successor);
    event SuperAdminTransferred(address indexed previous, address indexed successor);

    constructor() { superAdmin = msg.sender; }
    // Enforce positive intervals, not an election-duration policy. Operators
    // must allow enough time for wallet approvals and transaction inclusion.
    function minimumPhaseDuration() internal pure virtual returns (uint) { return MIN_PHASE_DURATION; }
    modifier onlySuperAdmin() { require(msg.sender == superAdmin, "Not super admin"); _; }
    modifier exists(uint id) { require(id > 0 && id <= electionCount, "Election does not exist"); _; }
    modifier onlyAdmin(uint id) { require(isElectionAdmin(id, msg.sender), "Not election admin"); _; }

    function isElectionAdmin(uint id, address account) public view exists(id) returns (bool) {
        return account == superAdmin || elections[id].admins[account];
    }
    function proposeSuperAdmin(address successor) external onlySuperAdmin {
        require(successor != address(0) && successor != superAdmin, "Invalid successor");
        pendingSuperAdmin = successor;
        emit SuperAdminTransferProposed(successor);
    }
    function acceptSuperAdmin() external {
        require(msg.sender == pendingSuperAdmin, "Not pending super admin");
        address previous = superAdmin;
        superAdmin = msg.sender;
        pendingSuperAdmin = address(0);
        emit SuperAdminTransferred(previous, msg.sender);
    }
    function assignAdmin(uint id, address account) external onlySuperAdmin exists(id) {
        require(account != address(0), "Zero address");
        elections[id].admins[account] = true;
        emit AdminAssigned(id, account);
    }
    function revokeAdmin(uint id, address account) external onlySuperAdmin exists(id) {
        elections[id].admins[account] = false;
        emit AdminRevoked(id, account);
    }
    function createElection(string calldata name, uint start, uint votingEnd, uint end, bool commitReveal)
        external onlySuperAdmin
    {
        validateName(name);
        require(start > block.timestamp, "Start must be in future");
        require(votingEnd >= start + minimumPhaseDuration(), "Voting phase too short");
        if (commitReveal) require(end >= votingEnd + minimumPhaseDuration(), "Reveal phase too short");
        else require(end == votingEnd, "Plain end must equal voting end");
        Election storage e = elections[++electionCount];
        e.name = name; e.startTime = start; e.votingEnd = votingEnd;
        e.endTime = end; e.commitReveal = commitReveal;
        emit ElectionCreated(electionCount, name, commitReveal);
    }
    function validateName(string memory name) private pure {
        bytes memory value = bytes(name);
        require(value.length > 0 && value.length <= 100, "Name must be 1-100 bytes");
        bool visible = false;
        for (uint i; i < value.length; i++) if (uint8(value[i]) > 32) visible = true;
        require(visible, "Blank name");
    }
    function requireSetup(Election storage e) private view {
        require(!e.setupSealed && !e.cancelled && block.timestamp < e.startTime, "Setup closed");
    }
    function addCandidate(uint id, string calldata name) external onlyAdmin(id) { addOne(id, name); }
    function addCandidates(uint id, string[] calldata names) external onlyAdmin(id) {
        require(names.length > 0 && names.length <= MAX_BATCH, "Invalid batch size");
        for (uint i; i < names.length; i++) addOne(id, names[i]);
    }
    function addOne(uint id, string memory name) private {
        Election storage e = elections[id]; requireSetup(e); validateName(name);
        require(e.candidateCount < MAX_CANDIDATES, "Candidate limit");
        bytes32 key = keccak256(bytes(name));
        require(!e.names[key], "Duplicate candidate"); e.names[key] = true;
        uint candidate = ++e.candidateCount;
        e.candidates[candidate] = Candidate(candidate, name, 0);
        emit CandidateAdded(id, candidate, name);
    }
    function authorizeVoter(uint id, address voter) external onlyAdmin(id) { authorizeOne(id, voter); }
    function authorizeVoters(uint id, address[] calldata voters) external onlyAdmin(id) {
        require(voters.length > 0 && voters.length <= MAX_BATCH, "Invalid batch size");
        for (uint i; i < voters.length; i++) authorizeOne(id, voters[i]);
    }
    function authorizeOne(uint id, address voter) private {
        Election storage e = elections[id]; requireSetup(e);
        require(voter != address(0), "Zero address");
        if (!e.voters[voter].isAuthorized) {
            e.voters[voter].isAuthorized = true; e.voterCount++;
            emit VoterAuthorized(id, voter);
        }
    }
    function revokeVoter(uint id, address voter) external onlyAdmin(id) {
        Election storage e = elections[id]; requireSetup(e);
        require(e.voters[voter].isAuthorized, "Not authorized");
        e.voters[voter].isAuthorized = false; e.voterCount--;
        emit VoterRevoked(id, voter);
    }
    function startElection(uint id) external onlyAdmin(id) {
        Election storage e = elections[id]; requireSetup(e);
        require(e.candidateCount >= 2 && e.voterCount > 0, "Incomplete setup");
        e.setupSealed = true; emit ElectionStarted(id);
    }
    function cancelElection(uint id) external onlyAdmin(id) {
        Election storage e = elections[id]; requireSetup(e);
        e.cancelled = true; emit ElectionCancelled(id);
    }
    function electionState(uint id) public view exists(id) returns (ElectionState) {
        Election storage e = elections[id];
        if (e.cancelled || (!e.setupSealed && block.timestamp >= e.startTime)) return ElectionState.Cancelled;
        if (!e.setupSealed || block.timestamp < e.startTime) return ElectionState.Created;
        if (block.timestamp >= e.endTime) return ElectionState.Ended;
        if (e.commitReveal && block.timestamp >= e.votingEnd) return ElectionState.Reveal;
        return ElectionState.Active;
    }
    function startReveal(uint id) external exists(id) {
        require(electionState(id) == ElectionState.Reveal, "Not in reveal phase");
        require(!elections[id].revealReported, "Already reported");
        elections[id].revealReported = true; emit RevealStarted(id);
    }
    function endElection(uint id) external exists(id) {
        require(electionState(id) == ElectionState.Ended, "Election not ended");
        require(!elections[id].endReported, "Already reported");
        elections[id].endReported = true; emit ElectionEnded(id);
    }
    function validCandidate(Election storage e, uint candidate) private view {
        require(candidate > 0 && candidate <= e.candidateCount, "Invalid candidate");
    }
    function vote(uint id, uint candidate) external exists(id) {
        Election storage e = elections[id];
        require(!e.commitReveal, "Use commit-reveal voting");
        require(electionState(id) == ElectionState.Active, "Election not active");
        Voter storage v = e.voters[msg.sender];
        require(v.isAuthorized, "Not authorized"); require(!v.hasVoted, "Already voted");
        validCandidate(e, candidate);
        v.hasVoted = true; e.candidates[candidate].voteCount++;
        emit VoteCast(id, msg.sender);
    }
    function commitmentFor(uint id, uint candidate, bytes32 secret, address voter) public view exists(id) returns (bytes32) {
        return keccak256(abi.encode(COMMITMENT_TYPEHASH, block.chainid, address(this), id, voter, candidate, secret));
    }
    function commitVote(uint id, bytes32 commitment) external exists(id) {
        Election storage e = elections[id];
        require(e.commitReveal, "Not a commit-reveal election");
        require(electionState(id) == ElectionState.Active, "Commit phase closed");
        require(commitment != bytes32(0), "Empty commitment");
        Voter storage v = e.voters[msg.sender];
        require(v.isAuthorized, "Not authorized"); require(!v.hasCommitted, "Already committed");
        v.commitment = commitment; v.hasCommitted = true;
        emit VoteCommitted(id, msg.sender);
    }
    function revealVote(uint id, uint candidate, bytes32 secret) external exists(id) {
        Election storage e = elections[id];
        require(e.commitReveal, "Not a commit-reveal election");
        require(electionState(id) == ElectionState.Reveal, "Not in reveal phase");
        Voter storage v = e.voters[msg.sender];
        require(v.hasCommitted, "No commitment found"); require(!v.hasVoted, "Already revealed");
        validCandidate(e, candidate);
        require(commitmentFor(id, candidate, secret, msg.sender) == v.commitment, "Reveal does not match commitment");
        v.hasVoted = true; e.candidates[candidate].voteCount++;
        emit VoteRevealed(id, msg.sender);
    }
    function getCandidateVotes(uint id, uint candidate) external view exists(id) returns (uint) {
        validCandidate(elections[id], candidate);
        require(electionState(id) == ElectionState.Ended, "Results not available yet");
        return elections[id].candidates[candidate].voteCount;
    }
    function getVoter(uint id, address voter) external view exists(id) returns (bool authorized, bool voted, bool committed) {
        Voter storage v = elections[id].voters[voter];
        return (v.isAuthorized, v.hasVoted, v.hasCommitted);
    }
    function getElection(uint id) external view exists(id) returns (
        string memory name, uint startTime, uint votingEnd, uint endTime, bool commitReveal,
        bool isSealed, ElectionState state, uint candidateCount, uint voterCount
    ) {
        Election storage e = elections[id];
        name = e.name; startTime = e.startTime; votingEnd = e.votingEnd; endTime = e.endTime;
        commitReveal = e.commitReveal; isSealed = e.setupSealed; state = electionState(id);
        candidateCount = e.candidateCount; voterCount = e.voterCount;
    }
}
