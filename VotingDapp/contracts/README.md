# Voting contracts

| File | Purpose |
|---|---|
| [VotingV2.sol](VotingV2.sol) | Scheduled protocol, sealed setup, role management and domain-separated commitments |
| [Voting.sol](Voting.sol) | Manual phase transitions for existing deployments and comparative benchmarks |
| [test/VotingLocalTest.sol](test/VotingLocalTest.sol) | Local-only fast-timing fixture |

The frontend selects the ABI for the configured deployment. For scheduled
elections it verifies the address, chain, deployment block and runtime-code hash.

Contracts enforce permissions independently of the UI. A connected wallet is
not proof of a unique real-world voter, and commit–reveal is delayed disclosure,
not anonymous or coercion-resistant voting. Review the
[security limitations](../../docs/SECURITY-REVIEW.md) before making claims about
privacy or suitability for binding elections.

Compile/test through the parent Hardhat package. Do not deploy the
[local fixture](test/README.md) to a public network. Existing Solidity license
headers and package licenses are preserved, not replaced by the root license.
