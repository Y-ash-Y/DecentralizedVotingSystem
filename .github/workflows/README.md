# Continuous integration

[ci.yml](ci.yml) uses the root Node version and both committed npm lockfiles. It
checks publication candidates, dependency advisories, contracts, coverage,
frontend services/UI/browser behavior, builds, local deployment and benchmarks.

The verification job applies the pinned Zod v3 mitigation after script-disabled
installation and runs its tooling tests. Independent dependency audit jobs scan
each lockfile at `--audit-level=low`. An audit failure leaves the other audit and
the verification job running, but still fails the workflow. The local backport
does not clear the version-based advisory or permit a release.

Contract tests, deployment smoke and gas measurements explicitly use the
simulated Hardhat network. No personal wallet, secret RPC credential or testnet
funds are required. The frontend browser tests use a simulated wallet and a local
preview.

Workflow permissions are read-only for repository content. A workflow file is
not proof of a successful run: inspect the current Actions result. Historical
observations and limits are in [verification](../../docs/VERIFICATION.md).
