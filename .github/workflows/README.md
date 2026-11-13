# Continuous integration

[Build & Tests](build-and-tests.yml) uses the pinned Node version and both npm
lockfiles. It checks publication candidates, contracts, frontend services and
browser behavior, coverage, builds, local deployment, and benchmarks. It
applies the pinned Zod v3 mitigation after installing dependencies with
lifecycle scripts disabled and runs the patch's regression tests.

[Dependency Audit](dependency-audit.yml) scans both lockfiles at
`--audit-level=low`. Either audit can fail the audit workflow, and each job
reports its own result. The Build & Tests workflow and its badge track
verification independently. See the [dependency notes](../../docs/DEPENDENCIES.md)
for the open advisory and the scope of the local mitigation.

Contract tests, deployment smoke and gas measurements explicitly use the
simulated Hardhat network. No personal wallet, secret RPC credential or testnet
funds are required. The frontend browser tests use a simulated wallet and a local
preview.

Workflow permissions are read-only for repository content. A workflow file is
not proof of a successful run: inspect the current Actions result. Historical
observations and limits are in [verification](../../docs/VERIFICATION.md).
