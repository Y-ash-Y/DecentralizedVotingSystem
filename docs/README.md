# VoteChain documentation

Start with the root [README](../README.md) for the local demo and package layout.

| Document | Purpose |
|---|---|
| [Engineering](ENGINEERING.md) | Architecture, protocol boundaries and implementation decisions |
| [Deployment](DEPLOYMENT.md) | Explicit deployment/configuration and recovery procedure |
| [Manual wallet tests](MANUAL-WALLET-TESTS.md) | Account switching, timing, wallet approval and recovery acceptance |
| [Verification](VERIFICATION.md) | Observed tests, execution dates and limits |
| [Benchmarks](BENCHMARKS.md) | Controlled gas/event measurements and reproduction |
| [Security review](SECURITY-REVIEW.md) | Threat model, safeguards and unresolved risks |
| [Dependency verification](DEPENDENCIES.md) | Audit policy, tooling and the open Hardhat advisory |
| [Toolchain feasibility](TOOLCHAIN-FEASIBILITY.md) | Isolated alternative-toolchain tests, security findings and migration requirements |
| [Pinned local mitigation](../VotingDapp/patches/README.md) | Zod v3 upper-bound backport, installer integrity checks and explicit limits |

[evidence/release-checks.json](evidence/release-checks.json) is a historical
verification record, not proof that a later revision has passed. Check the new
commit's Actions run and distinguish automated simulations from real-wallet
acceptance.

Keep the limitations with any demonstration: wallet enrollment is trusted,
commit–reveal is not anonymity or coercion resistance, backups are plaintext,
and the project is not certified for binding elections. Documentation does not
replace independent security review.
