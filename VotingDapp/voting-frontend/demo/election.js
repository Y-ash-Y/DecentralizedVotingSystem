import { commitmentHash, generateSecret } from "../src/lib/commitments.js";

// Illustrative addresses with no associated wallet keys in the sandbox.
const voter = "0x0000000000000000000000000000000000000b0b";
const domain = {
  chainId: 31337,
  contract: "0x0000000000000000000000000000000000000001",
  electionId: 1,
};
export const phases = ["setup", "sealed", "commit", "reveal", "results"];

function requireDemo(condition, message) {
  if (!condition) throw new Error(message);
}

export function applyAction(election, actor, action) {
  if (action.type === "create") {
    const name = action.name.trim();
    requireDemo(actor === "admin" && !election, "Only the demo admin can create an election.");
    requireDemo(name.length > 0 && name.length <= 60, "Enter an election name of 1–60 characters.");
    return { name, phase: "setup", candidates: [], enrolled: false, hash: null, backup: null, vote: null };
  }

  requireDemo(election, "Create an election first.");
  switch (action.type) {
    case "candidates": {
      requireDemo(actor === "admin" && election.phase === "setup", "Candidate registration is closed.");
      const names = action.names.map(name => name.trim());
      requireDemo(names.length === 2 && names.every(name => name.length > 0 && name.length <= 40) &&
        new Set(names.map(name => name.toLowerCase())).size === names.length,
      "Enter two distinct candidate names.");
      return { ...election, candidates: names.map((name, index) => ({ id: index + 1, name })) };
    }
    case "enroll":
      requireDemo(actor === "admin" && election.phase === "setup", "Voter enrollment is closed.");
      return { ...election, enrolled: true };
    case "seal":
      requireDemo(actor === "admin" && election.phase === "setup", "Only the demo admin can seal setup.");
      requireDemo(election.candidates.length === 2 && election.enrolled, "Register candidates and enroll the voter before sealing.");
      return { ...election, phase: "sealed" };
    case "advance": {
      const index = phases.indexOf(election.phase);
      requireDemo(index >= 1 && index < phases.length - 1, "Seal setup before advancing the demo clock.");
      return { ...election, phase: phases[index + 1] };
    }
    case "commit": {
      requireDemo(actor === "voter" && election.enrolled && election.phase === "commit" && !election.hash,
        "Only the enrolled voter can commit once during voting.");
      requireDemo(election.candidates.some(candidate => candidate.id === action.choice), "Choose a candidate.");
      const secret = generateSecret();
      const hash = commitmentHash(action.choice, secret, voter, domain);
      return { ...election, hash, backup: { choice: action.choice, secret } };
    }
    case "reveal": {
      requireDemo(actor === "voter" && election.enrolled && election.phase === "reveal" && election.hash && election.vote === null,
        "Only the voter who committed can reveal once during the reveal phase.");
      const { choice, secret } = action.backup ?? {};
      requireDemo(election.candidates.some(candidate => candidate.id === choice) && /^0x[0-9a-f]{64}$/i.test(secret),
        "A valid ballot backup is required.");
      requireDemo(commitmentHash(choice, secret, voter, domain) === election.hash, "The reveal does not match the commitment.");
      return { ...election, vote: choice };
    }
    default:
      throw new Error("Unknown demo action.");
  }
}
