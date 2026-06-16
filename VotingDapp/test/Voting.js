const { ethers } = require("hardhat");
const { expect } = require("chai");

const START = 0;
const END = 9999999999;

describe("VotingSystem", function () {
  let voting;
  let superAdmin, electionAdmin, voter1, voter2, outsider;

  beforeEach(async function () {
    [superAdmin, electionAdmin, voter1, voter2, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("VotingSystem");
    voting = await Factory.deploy();
    await voting.deployed();
  });

  describe("Deployment", function () {
    it("sets the deployer as super admin", async function () {
      expect(await voting.superAdmin()).to.equal(superAdmin.address);
    });

    it("starts with zero elections", async function () {
      expect(await voting.electionCount()).to.equal(0);
    });
  });

  describe("createElection", function () {
    it("lets the super admin create an election and emits ElectionCreated", async function () {
      await expect(voting.createElection("Council 2025", START, END))
        .to.emit(voting, "ElectionCreated")
        .withArgs(1, "Council 2025");
      expect(await voting.electionCount()).to.equal(1);
    });

    it("reverts for a non-super-admin", async function () {
      await expect(
        voting.connect(outsider).createElection("Hack", START, END)
      ).to.be.revertedWith("Not super admin");
    });

    it("reverts when startTime >= endTime", async function () {
      await expect(voting.createElection("Bad range", 100, 100)).to.be.revertedWith(
        "Invalid time range"
      );
    });
  });

  describe("assignAdmin", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END);
    });

    it("lets the super admin grant election-admin rights", async function () {
      await expect(voting.assignAdmin(1, electionAdmin.address))
        .to.emit(voting, "AdminAssigned")
        .withArgs(1, electionAdmin.address);

      // The newly-assigned admin can now add a candidate.
      await expect(voting.connect(electionAdmin).addCandidate(1, "Alice")).to.emit(
        voting,
        "CandidateAdded"
      );
    });

    it("reverts for a non-super-admin", async function () {
      await expect(
        voting.connect(outsider).assignAdmin(1, outsider.address)
      ).to.be.revertedWith("Not super admin");
    });

    it("reverts for a non-existent election", async function () {
      await expect(voting.assignAdmin(99, electionAdmin.address)).to.be.revertedWith(
        "Election does not exist"
      );
    });
  });

  describe("addCandidate", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END);
    });

    it("lets the election admin add candidates with incrementing ids", async function () {
      await expect(voting.addCandidate(1, "Alice"))
        .to.emit(voting, "CandidateAdded")
        .withArgs(1, 1, "Alice");
      await expect(voting.addCandidate(1, "Bob"))
        .to.emit(voting, "CandidateAdded")
        .withArgs(1, 2, "Bob");
    });

    it("reverts for a non-admin", async function () {
      await expect(
        voting.connect(outsider).addCandidate(1, "Mallory")
      ).to.be.revertedWith("Not election admin");
    });

    it("reverts once the election has started", async function () {
      await voting.startElection(1);
      await expect(voting.addCandidate(1, "Late")).to.be.revertedWith(
        "Election already started"
      );
    });
  });

  describe("Election lifecycle", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END);
      await voting.addCandidate(1, "Alice");
    });

    it("transitions Created -> Active -> Ended", async function () {
      await expect(voting.startElection(1)).to.emit(voting, "ElectionStarted").withArgs(1);
      await expect(voting.endElection(1)).to.emit(voting, "ElectionEnded").withArgs(1);
    });

    it("cannot start an election twice", async function () {
      await voting.startElection(1);
      await expect(voting.startElection(1)).to.be.revertedWith("Invalid state");
    });

    it("cannot end an election that is not active", async function () {
      await expect(voting.endElection(1)).to.be.revertedWith("Election not active");
    });

    it("only the admin can start or end", async function () {
      await expect(voting.connect(outsider).startElection(1)).to.be.revertedWith(
        "Not election admin"
      );
      await voting.startElection(1);
      await expect(voting.connect(outsider).endElection(1)).to.be.revertedWith(
        "Not election admin"
      );
    });
  });

  describe("authorizeVoter", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END);
    });

    it("emits VoterAuthorized", async function () {
      await expect(voting.authorizeVoter(1, voter1.address))
        .to.emit(voting, "VoterAuthorized")
        .withArgs(1, voter1.address);
    });

    it("reverts for a non-admin", async function () {
      await expect(
        voting.connect(outsider).authorizeVoter(1, voter1.address)
      ).to.be.revertedWith("Not election admin");
    });
  });

  describe("vote", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END);
      await voting.addCandidate(1, "Alice");
      await voting.addCandidate(1, "Bob");
      await voting.authorizeVoter(1, voter1.address);
      await voting.authorizeVoter(1, voter2.address);
    });

    it("reverts on a non-existent election", async function () {
      await voting.startElection(1);
      await expect(voting.connect(voter1).vote(99, 1)).to.be.revertedWith(
        "Election does not exist"
      );
    });

    it("reverts when the election is not active", async function () {
      await expect(voting.connect(voter1).vote(1, 1)).to.be.revertedWith(
        "Election not active"
      );
    });

    it("reverts for an unauthorized voter", async function () {
      await voting.startElection(1);
      await expect(voting.connect(outsider).vote(1, 1)).to.be.revertedWith(
        "Not authorized"
      );
    });

    it("reverts for an invalid candidate id", async function () {
      await voting.startElection(1);
      await expect(voting.connect(voter1).vote(1, 0)).to.be.revertedWith("Invalid candidate");
      await expect(voting.connect(voter1).vote(1, 99)).to.be.revertedWith("Invalid candidate");
    });

    it("records a valid vote and emits VoteCast", async function () {
      await voting.startElection(1);
      await expect(voting.connect(voter1).vote(1, 1))
        .to.emit(voting, "VoteCast")
        .withArgs(1, voter1.address);
    });

    it("prevents double voting", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).vote(1, 1);
      await expect(voting.connect(voter1).vote(1, 2)).to.be.revertedWith("Already voted");
    });

    it("tallies votes correctly across voters", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).vote(1, 1); // Alice
      await voting.connect(voter2).vote(1, 1); // Alice
      await voting.endElection(1);
      expect(await voting.getCandidateVotes(1, 1)).to.equal(2); // Alice
      expect(await voting.getCandidateVotes(1, 2)).to.equal(0); // Bob
    });
  });

  describe("getCandidateVotes", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END);
      await voting.addCandidate(1, "Alice");
      await voting.authorizeVoter(1, voter1.address);
    });

    it("reverts before the election has ended", async function () {
      await expect(voting.getCandidateVotes(1, 1)).to.be.revertedWith(
        "Results not available yet"
      );
      await voting.startElection(1);
      await expect(voting.getCandidateVotes(1, 1)).to.be.revertedWith(
        "Results not available yet"
      );
    });

    it("returns results once the election has ended", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).vote(1, 1);
      await voting.endElection(1);
      expect(await voting.getCandidateVotes(1, 1)).to.equal(1);
    });
  });
});
