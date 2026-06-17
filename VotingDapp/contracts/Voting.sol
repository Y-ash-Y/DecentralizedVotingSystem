// SPDX-License-Identifier: MPL-2.0
pragma solidity ^0.8.20;

contract VotingSystem {

    address public superAdmin;
    uint public electionCount;

    constructor() {
        superAdmin = msg.sender;
    }

    // Created -> Active -> Ended                (plain elections)
    // Created -> Active -> Reveal -> Ended       (commit-reveal elections)
    enum ElectionState { Created, Active, Reveal, Ended }

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    struct Voter {
        bool isAuthorized;
        bool hasVoted;        // plain: cast a vote   | commit-reveal: revealed
        uint votedCandidateId;
        bytes32 commitment;   // commit-reveal: keccak256(candidateId, secret, voter)
        bool hasCommitted;    // commit-reveal: submitted a commitment
    }

    struct Election {
        uint id;
        string name;
        uint startTime;
        uint endTime;
        ElectionState state;
        bool commitReveal;    // true => private commit-reveal voting

        uint candidateCount;

        mapping(uint => Candidate) candidates;
        mapping(address => Voter) voters;
        mapping(address => bool) admins;
    }

    mapping(uint => Election) private elections;

    // -------- EVENTS --------

    event ElectionCreated(uint electionId, string name, bool commitReveal);
    event AdminAssigned(uint electionId, address admin);
    event CandidateAdded(uint electionId, uint candidateId, string name);
    event VoterAuthorized(uint electionId, address voter);
    event VoteCast(uint electionId, address voter);
    event VoteCommitted(uint electionId, address voter);
    event VoteRevealed(uint electionId, address voter);
    event ElectionStarted(uint electionId);
    event RevealStarted(uint electionId);
    event ElectionEnded(uint electionId);

    // -------- MODIFIERS --------

    modifier onlySuperAdmin() {
        require(msg.sender == superAdmin, "Not super admin");
        _;
    }

    modifier onlyElectionAdmin(uint _electionId) {
        require(
            elections[_electionId].admins[msg.sender],
            "Not election admin"
        );
        _;
    }

    modifier electionExists(uint _electionId) {
        require(_electionId > 0 && _electionId <= electionCount,
            "Election does not exist");
        _;
    }

    // -------- ELECTION MANAGEMENT --------

    function createElection(
        string memory _name,
        uint _startTime,
        uint _endTime,
        bool _commitReveal
    ) public onlySuperAdmin {

        require(_startTime < _endTime, "Invalid time range");

        electionCount++;

        Election storage e = elections[electionCount];
        e.id = electionCount;
        e.name = _name;
        e.startTime = _startTime;
        e.endTime = _endTime;
        e.state = ElectionState.Created;
        e.commitReveal = _commitReveal;

        e.admins[msg.sender] = true;

        emit ElectionCreated(electionCount, _name, _commitReveal);
    }

    function assignAdmin(
        uint _electionId,
        address _admin
    ) public onlySuperAdmin electionExists(_electionId) {

        elections[_electionId].admins[_admin] = true;

        emit AdminAssigned(_electionId, _admin);
    }

    // -------- CANDIDATE MANAGEMENT --------

    function addCandidate(
        uint _electionId,
        string memory _name
    ) public onlyElectionAdmin(_electionId) {

        Election storage e = elections[_electionId];

        require(e.state == ElectionState.Created,
            "Election already started");

        e.candidateCount++;

        e.candidates[e.candidateCount] =
            Candidate(e.candidateCount, _name, 0);

        emit CandidateAdded(_electionId, e.candidateCount, _name);
    }

    // Batch variant: add many candidates in a single transaction (one signature).
    function addCandidates(
        uint _electionId,
        string[] memory _names
    ) public onlyElectionAdmin(_electionId) {

        Election storage e = elections[_electionId];

        require(e.state == ElectionState.Created,
            "Election already started");

        for (uint i = 0; i < _names.length; i++) {
            e.candidateCount++;
            e.candidates[e.candidateCount] =
                Candidate(e.candidateCount, _names[i], 0);
            emit CandidateAdded(_electionId, e.candidateCount, _names[i]);
        }
    }

    // -------- VOTER MANAGEMENT --------

    function authorizeVoter(
        uint _electionId,
        address _voter
    ) public onlyElectionAdmin(_electionId) {

        elections[_electionId].voters[_voter].isAuthorized = true;

        emit VoterAuthorized(_electionId, _voter);
    }

    // Batch variant: authorize many voters in a single transaction (one signature).
    function authorizeVoters(
        uint _electionId,
        address[] memory _voters
    ) public onlyElectionAdmin(_electionId) {

        Election storage e = elections[_electionId];

        for (uint i = 0; i < _voters.length; i++) {
            e.voters[_voters[i]].isAuthorized = true;
            emit VoterAuthorized(_electionId, _voters[i]);
        }
    }

    // -------- ELECTION STATE --------

    function startElection(uint _electionId)
        public
        onlyElectionAdmin(_electionId)
    {
        Election storage e = elections[_electionId];

        require(e.state == ElectionState.Created,
            "Invalid state");

        e.state = ElectionState.Active;

        emit ElectionStarted(_electionId);
    }

    // Move a commit-reveal election from the commit window into the reveal window.
    function startReveal(uint _electionId)
        public
        onlyElectionAdmin(_electionId)
    {
        Election storage e = elections[_electionId];

        require(e.commitReveal, "Not a commit-reveal election");
        require(e.state == ElectionState.Active, "Invalid state");

        e.state = ElectionState.Reveal;

        emit RevealStarted(_electionId);
    }

    function endElection(uint _electionId)
        public
        onlyElectionAdmin(_electionId)
    {
        Election storage e = elections[_electionId];

        // Plain elections end from Active; commit-reveal elections end from Reveal.
        if (e.commitReveal) {
            require(e.state == ElectionState.Reveal, "Reveal not started");
        } else {
            require(e.state == ElectionState.Active, "Election not active");
        }

        e.state = ElectionState.Ended;

        emit ElectionEnded(_electionId);
    }

    // -------- PLAIN VOTING --------

    function vote(uint _electionId, uint _candidateId)
        public
        electionExists(_electionId)
    {
        Election storage e = elections[_electionId];

        require(!e.commitReveal, "Use commit-reveal voting");
        require(e.state == ElectionState.Active,
            "Election not active");

        Voter storage voter = e.voters[msg.sender];

        require(voter.isAuthorized, "Not authorized");
        require(!voter.hasVoted, "Already voted");
        require(
            _candidateId > 0 &&
            _candidateId <= e.candidateCount,
            "Invalid candidate"
        );

        voter.hasVoted = true;
        voter.votedCandidateId = _candidateId;

        e.candidates[_candidateId].voteCount++;

        emit VoteCast(_electionId, msg.sender);
    }

    // -------- COMMIT-REVEAL VOTING --------

    // Phase 1 — submit a hashed vote during the Active window. The commitment is
    // keccak256(abi.encodePacked(candidateId, secret, voterAddress)); it reveals
    // nothing about the chosen candidate.
    function commitVote(uint _electionId, bytes32 _commitment)
        public
        electionExists(_electionId)
    {
        Election storage e = elections[_electionId];

        require(e.commitReveal, "Not a commit-reveal election");
        require(e.state == ElectionState.Active, "Commit phase closed");

        Voter storage voter = e.voters[msg.sender];

        require(voter.isAuthorized, "Not authorized");
        require(!voter.hasCommitted, "Already committed");

        voter.commitment = _commitment;
        voter.hasCommitted = true;

        emit VoteCommitted(_electionId, msg.sender);
    }

    // Phase 2 — reveal the plaintext during the Reveal window. The contract
    // recomputes the commitment and only counts the vote if it matches.
    function revealVote(
        uint _electionId,
        uint _candidateId,
        string memory _secret
    )
        public
        electionExists(_electionId)
    {
        Election storage e = elections[_electionId];

        require(e.commitReveal, "Not a commit-reveal election");
        require(e.state == ElectionState.Reveal, "Not in reveal phase");

        Voter storage voter = e.voters[msg.sender];

        require(voter.hasCommitted, "No commitment found");
        require(!voter.hasVoted, "Already revealed");
        require(
            _candidateId > 0 &&
            _candidateId <= e.candidateCount,
            "Invalid candidate"
        );

        bytes32 check = keccak256(
            abi.encodePacked(_candidateId, _secret, msg.sender)
        );
        require(check == voter.commitment, "Reveal does not match commitment");

        voter.hasVoted = true;
        voter.votedCandidateId = _candidateId;

        e.candidates[_candidateId].voteCount++;

        emit VoteRevealed(_electionId, msg.sender);
    }

    // -------- VIEW FUNCTIONS --------

    function getCandidateVotes(
        uint _electionId,
        uint _candidateId
    ) public view returns (uint) {

        Election storage e = elections[_electionId];

        require(
            e.state == ElectionState.Ended,
            "Results not available yet"
        );

        return e.candidates[_candidateId].voteCount;
    }
}
