# Dependency verification — November 2026

CI runs verification and dependency audits independently. Either audit fails
the workflow on a known advisory of low severity or higher.

## Tooling and mitigation

A reproducible [local mitigation](../VotingDapp/patches/README.md) now rejects
oversized bounded Zod v3 arrays and sets before their element walks. It preserves
package identity/version and leaves unbounded containers and v4 compatibility
exports outside scope. It does not close the advisory or clear the strict gate.
CI explicitly applies/verifies it after `npm ci --ignore-scripts`; contract
`npm test` also applies it and runs 39 additional tooling regressions.

- Hardhat 3.21.2, ethers plugin 4.2.2, Chai matchers 3.0.13 and Mocha plugin 4.0.1.
- Mocha 12.0.3, with scoped `glob` 14.0.2 and `minimatch` 11.0.1 security overrides.
- Vite 8.3.5 and Vitest 4.1.12, with refreshed compatible transitive lock entries.

The two npm projects retain separate lockfiles. Solidity 0.8.20, compiler
settings, contract source, ABI source, deployment configuration and credentials
are not changed by this update. The Mocha overrides intentionally cross its
declared glob/minimatch major ranges and require the project's full regression
checks; remove/review them when upstream supports the patched versions directly.

## Open advisory

The frontend audit reports zero findings. The contract development tree still
reports six high-severity affected dependency entries, all tracing to one
underlying [Zod resource-consumption advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Installed Zod is 3.25.76; the advisory lists 4.6.6 as patched. The current
Hardhat/plugin dependency ranges still require Zod 3, so there is no compatible
upstream update within those ranges.

The [Hardhat maintainer's assessment](https://github.com/NomicFoundation/hardhat/issues/8817#issuecomment-6691753117)
identifies a Hardhat node with Ledger accounts as a case where a large client
request could crash the development node. The VoteChain demo binds to loopback
and configures no Ledger accounts. The dependency remains flagged by npm.

An isolated [alternative-toolchain investigation](TOOLCHAIN-FEASIBILITY.md)
found functional Foundry/Anvil compatibility, but also native dependency
advisories that need review. No replacement or audit waiver has been applied.

Do not force a Zod 4 override, suppress audit output or lower CI severity merely
to obtain a green check. Await an upstream-compatible fix or separately plan and
test a toolchain change. Development-tool exposure is not evidence that the
Solidity contract is exploitable, but it is still an unresolved dependency risk.

## Recheck

From each package directory run `npm ci --ignore-scripts` and
`npm audit --audit-level=low`. The contract audit is expected to fail until the
upstream issue is resolved. Then run the complete workflow in
[verification](VERIFICATION.md), including fresh ordinary artifacts after
coverage. A clean audit is a point-in-time advisory check, not a security proof.

See [verification](VERIFICATION.md) for historical results and GitHub Actions
for the latest per-job results.
