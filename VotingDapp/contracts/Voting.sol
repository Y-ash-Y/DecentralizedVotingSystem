// SPDX-License-Identifier: MPL-2.0
pragma solidity ^0.8.20;

contract VotingSystem {

    address public superAdmin;
    uint public electionCount;

    constructor() {
        superAdmin = msg.sender;
    }

    enum ElectionState { Created, Active, Ended }

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    struct Voter {
        bool isAuthorized;
        bool hasVoted;
        uint votedCandidateId;
    }

    struct Election {
        uint id;
        string name;
        uint startTime;
        uint endTime;
        ElectionState state;

        uint candidateCount;

        mapping(uint => Candidate) candidates;
        mapping(address => Voter) voters;
        mapping(address => bool) admins;
    }

    mapping(uint => Election) private elections;

    // -------- EVENTS --------

    event ElectionCreated(uint electionId, string name);
    event AdminAssigned(uint electionId, address admin);
    event CandidateAdded(uint electionId, uint candidateId, string name);
    event VoterAuthorized(uint electionId, address voter);
    event VoteCast(uint electionId, address voter);
    event ElectionStarted(uint electionId);
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
        uint _endTime
    ) public onlySuperAdmin {

        require(_startTime < _endTime, "Invalid time range");

        electionCount++;

        Election storage e = elections[electionCount];
        e.id = electionCount;
        e.name = _name;
        e.startTime = _startTime;
        e.endTime = _endTime;
        e.state = ElectionState.Created;

        e.admins[msg.sender] = true;

        emit ElectionCreated(electionCount, _name);
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

    // -------- VOTER MANAGEMENT --------

    function authorizeVoter(
        uint _electionId,
        address _voter
    ) public onlyElectionAdmin(_electionId) {

        elections[_electionId].voters[_voter].isAuthorized = true;

        emit VoterAuthorized(_electionId, _voter);
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

    function endElection(uint _electionId)
        public
        onlyElectionAdmin(_electionId)
    {
        Election storage e = elections[_electionId];

        require(e.state == ElectionState.Active,
            "Election not active");

        e.state = ElectionState.Ended;

        emit ElectionEnded(_electionId);
    }

    // -------- VOTING --------

    function vote(uint _electionId, uint _candidateId)
        public
        electionExists(_electionId)
    {
        Election storage e = elections[_electionId];

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