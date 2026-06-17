const { ethers } = require("hardhat");
const { expect } = require("chai");

const START = 0;
const END = 9999999999;

// Mirror of the on-chain commitment: keccak256(abi.encodePacked(candidateId, secret, voter)).
function commitmentFor(candidateId, secret, voter) {
  return ethers.utils.solidityKeccak256(
    ["uint256", "string", "address"],
    [candidateId, secret, voter]
  );
}

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
      await expect(voting.createElection("Council 2025", START, END, false))
        .to.emit(voting, "ElectionCreated")
        .withArgs(1, "Council 2025", false);
      expect(await voting.electionCount()).to.equal(1);
    });

    it("flags commit-reveal elections in the event", async function () {
      await expect(voting.createElection("Private 2025", START, END, true))
        .to.emit(voting, "ElectionCreated")
        .withArgs(1, "Private 2025", true);
    });

    it("reverts for a non-super-admin", async function () {
      await expect(
        voting.connect(outsider).createElection("Hack", START, END, false)
      ).to.be.revertedWith("Not super admin");
    });

    it("reverts when startTime >= endTime", async function () {
      await expect(
        voting.createElection("Bad range", 100, 100, false)
      ).to.be.revertedWith("Invalid time range");
    });
  });

  describe("assignAdmin", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
    });

    it("lets the super admin grant election-admin rights", async function () {
      await expect(voting.assignAdmin(1, electionAdmin.address))
        .to.emit(voting, "AdminAssigned")
        .withArgs(1, electionAdmin.address);

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
      await voting.createElection("E1", START, END, false);
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

  describe("addCandidates (batch)", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
    });

    it("adds several candidates in one call with sequential ids", async function () {
      const tx = await voting.addCandidates(1, ["Alice", "Bob", "Carol"]);
      const receipt = await tx.wait();
      const added = receipt.events.filter((e) => e.event === "CandidateAdded");
      expect(added.length).to.equal(3);
      expect(added.map((e) => e.args.candidateId.toNumber())).to.deep.equal([1, 2, 3]);
      expect(added.map((e) => e.args.name)).to.deep.equal(["Alice", "Bob", "Carol"]);
    });

    it("appends to candidates already added singly", async function () {
      await voting.addCandidate(1, "Alice"); // id 1
      await voting.addCandidates(1, ["Bob", "Carol"]); // ids 2, 3
      await voting.authorizeVoter(1, voter1.address);
      await voting.startElection(1);
      await voting.connect(voter1).vote(1, 3); // Carol
      await voting.endElection(1);
      expect(await voting.getCandidateVotes(1, 3)).to.equal(1);
    });

    it("reverts for a non-admin", async function () {
      await expect(
        voting.connect(outsider).addCandidates(1, ["X", "Y"])
      ).to.be.revertedWith("Not election admin");
    });

    it("reverts once the election has started", async function () {
      await voting.startElection(1);
      await expect(voting.addCandidates(1, ["Late"])).to.be.revertedWith(
        "Election already started"
      );
    });
  });

  describe("authorizeVoters (batch)", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
      await voting.addCandidate(1, "Alice");
    });

    it("authorizes several voters in one call", async function () {
      const tx = await voting.authorizeVoters(1, [voter1.address, voter2.address]);
      const receipt = await tx.wait();
      const evts = receipt.events.filter((e) => e.event === "VoterAuthorized");
      expect(evts.length).to.equal(2);

      // Both can now vote.
      await voting.startElection(1);
      await voting.connect(voter1).vote(1, 1);
      await voting.connect(voter2).vote(1, 1);
      await voting.endElection(1);
      expect(await voting.getCandidateVotes(1, 1)).to.equal(2);
    });

    it("reverts for a non-admin", async function () {
      await expect(
        voting.connect(outsider).authorizeVoters(1, [voter1.address])
      ).to.be.revertedWith("Not election admin");
    });
  });

  describe("Election lifecycle", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
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

    it("does not allow startReveal on a plain election", async function () {
      await voting.startElection(1);
      await expect(voting.startReveal(1)).to.be.revertedWith(
        "Not a commit-reveal election"
      );
    });
  });

  describe("authorizeVoter", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
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

  describe("vote (plain)", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
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

  describe("commit-reveal voting", function () {
    const SECRET1 = "alice-is-my-pick-42";
    const SECRET2 = "bob-all-the-way-7";

    beforeEach(async function () {
      await voting.createElection("Private", START, END, true);
      await voting.addCandidate(1, "Alice"); // id 1
      await voting.addCandidate(1, "Bob"); // id 2
      await voting.authorizeVoter(1, voter1.address);
      await voting.authorizeVoter(1, voter2.address);
    });

    it("rejects plain vote() on a commit-reveal election", async function () {
      await voting.startElection(1);
      await expect(voting.connect(voter1).vote(1, 1)).to.be.revertedWith(
        "Use commit-reveal voting"
      );
    });

    it("rejects commitVote on a plain election", async function () {
      await voting.createElection("Plain", START, END, false); // election 2
      await voting.startElection(2);
      await expect(
        voting.connect(voter1).commitVote(2, commitmentFor(1, SECRET1, voter1.address))
      ).to.be.revertedWith("Not a commit-reveal election");
    });

    it("accepts a commitment during Active and emits VoteCommitted", async function () {
      await voting.startElection(1);
      const c = commitmentFor(1, SECRET1, voter1.address);
      await expect(voting.connect(voter1).commitVote(1, c))
        .to.emit(voting, "VoteCommitted")
        .withArgs(1, voter1.address);
    });

    it("rejects commitments from unauthorized wallets", async function () {
      await voting.startElection(1);
      const c = commitmentFor(1, SECRET1, outsider.address);
      await expect(voting.connect(outsider).commitVote(1, c)).to.be.revertedWith(
        "Not authorized"
      );
    });

    it("rejects a second commitment from the same voter", async function () {
      await voting.startElection(1);
      const c = commitmentFor(1, SECRET1, voter1.address);
      await voting.connect(voter1).commitVote(1, c);
      await expect(voting.connect(voter1).commitVote(1, c)).to.be.revertedWith(
        "Already committed"
      );
    });

    it("rejects commitments before the election starts", async function () {
      const c = commitmentFor(1, SECRET1, voter1.address);
      await expect(voting.connect(voter1).commitVote(1, c)).to.be.revertedWith(
        "Commit phase closed"
      );
    });

    it("only the admin can start the reveal phase", async function () {
      await voting.startElection(1);
      await expect(voting.connect(outsider).startReveal(1)).to.be.revertedWith(
        "Not election admin"
      );
      await expect(voting.startReveal(1)).to.emit(voting, "RevealStarted").withArgs(1);
    });

    it("cannot end a commit-reveal election before reveal starts", async function () {
      await voting.startElection(1);
      await expect(voting.endElection(1)).to.be.revertedWith("Reveal not started");
    });

    it("rejects reveal outside the reveal phase", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).commitVote(1, commitmentFor(1, SECRET1, voter1.address));
      await expect(
        voting.connect(voter1).revealVote(1, 1, SECRET1)
      ).to.be.revertedWith("Not in reveal phase");
    });

    it("rejects reveal with no prior commitment", async function () {
      await voting.startElection(1);
      await voting.startReveal(1);
      await expect(
        voting.connect(voter1).revealVote(1, 1, SECRET1)
      ).to.be.revertedWith("No commitment found");
    });

    it("rejects a reveal that does not match the commitment", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).commitVote(1, commitmentFor(1, SECRET1, voter1.address));
      await voting.startReveal(1);
      // wrong candidate
      await expect(
        voting.connect(voter1).revealVote(1, 2, SECRET1)
      ).to.be.revertedWith("Reveal does not match commitment");
      // wrong secret
      await expect(
        voting.connect(voter1).revealVote(1, 1, "wrong-secret")
      ).to.be.revertedWith("Reveal does not match commitment");
    });

    it("counts a valid reveal and emits VoteRevealed", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).commitVote(1, commitmentFor(1, SECRET1, voter1.address));
      await voting.startReveal(1);
      await expect(voting.connect(voter1).revealVote(1, 1, SECRET1))
        .to.emit(voting, "VoteRevealed")
        .withArgs(1, voter1.address);
    });

    it("prevents revealing twice", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).commitVote(1, commitmentFor(1, SECRET1, voter1.address));
      await voting.startReveal(1);
      await voting.connect(voter1).revealVote(1, 1, SECRET1);
      await expect(
        voting.connect(voter1).revealVote(1, 1, SECRET1)
      ).to.be.revertedWith("Already revealed");
    });

    it("runs the full flow and tallies revealed votes only", async function () {
      await voting.startElection(1);
      await voting.connect(voter1).commitVote(1, commitmentFor(1, SECRET1, voter1.address)); // Alice
      await voting.connect(voter2).commitVote(1, commitmentFor(2, SECRET2, voter2.address)); // Bob
      await voting.startReveal(1);
      await voting.connect(voter1).revealVote(1, 1, SECRET1);
      // voter2 never reveals -> their vote is not counted
      await voting.endElection(1);
      expect(await voting.getCandidateVotes(1, 1)).to.equal(1); // Alice
      expect(await voting.getCandidateVotes(1, 2)).to.equal(0); // Bob (unrevealed)
    });
  });

  describe("getCandidateVotes", function () {
    beforeEach(async function () {
      await voting.createElection("E1", START, END, false);
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
