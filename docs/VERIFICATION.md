# Verification — 3 October 2026

## Observed results

| Check | Result and scope |
| --- | --- |
| Contract/local-EVM suite | 97 passing, including schedule boundaries, ownership, atomic batches, domain binding, independent seeded tallies and frontend ABI integration |
| Frontend services | 52 passing |
| Simulated DOM | 29 passing, including raw provider/backup error redaction |
| Isolated Chromium | 3 passing in hosted CI at 375/768/1440 px; isolated simulated wallet |
| Normal total | **181 passing**, not real-wallet tests |
| Contract coverage | 96 instrumented cases; all three contracts report 100% lines/statements |
| Clean installation | Both lockfiles installed in a credential-free temporary source copy; contracts/services/DOM/build pass |
| Deployment | Standard contract on a disposable in-process chain; no public funds or network |
| Dependency scans | Both packages: 0 known npm advisories at the 3 October pre-publication scan |
| Slither 0.11.5 | 2 October scan, unchanged contracts: 3 contracts, 101 detectors; 37 findings: 0 high, 0 medium, 3 low, 33 informational, 1 optimization |
| Public/hosted CI | All steps passed for code revision 244487fc5e5d1ee945e8c04fef0d29855e9d7c74 on 3 October |

[Hosted verification evidence](https://github.com/Y-ash-Y/DecentralizedVotingSystem/actions/runs/37103526694)
includes locked installation, publication preflight, both dependency scans,
contract tests/coverage, ordinary-artifact restoration, frontend services/build/UI,
browser tests, service coverage, event/gas benchmarks and disposable deployment.
The hosted browser installation succeeded; the missing local browser binary no
longer leaves the code revision's browser checks unverified. The run identifier
above is a fixed evidence checkpoint, not a claim about every future revision.

The user confirmed the real MetaMask local happy path through commit, backup,
reveal and final tally. On 3 October the owner also accepted the fresh local
walkthrough after the automatic-scheduling fix and requested project completion.
Earlier admin/voter role checks were also user-confirmed.
Rejected/replaced transactions, both modes on a public network and all remaining
manual checklist cases were not separately confirmed.

The follow-up adds eight DOM cases for successful repricing, cancelled/changed/
failed replacement receipts, reject-then-retry, remount-and-reveal recovery,
unenrolled controls and wrong-network recovery. Simulated vote effects now occur
only on successful receipts. These 28 DOM cases plus the new automatic-phase
polling case pass (29 total); this is not extension acceptance.
The owner opted for the existing internal source review and automated checks,
without an external-reviewer requirement. No independent audit is claimed.

On 3 October, a fresh isolated EVM using the actual local-demo network settings
mined idle blocks and crossed all four scheduled states without transactions
after setup, evm_mine or time-travel calls. The regression closes its own network
connection and never connects to the user's demo. A DOM test separately verifies
two-second local polling reveals each new phase without clicking Refresh. The
normal suite now has 97 contract cases and 29 DOM cases. Sepolia keeps 15-second
UI polling; no contract, deadline, public deployment or wallet behavior changed.

The clean-copy run uses the same source and lockfiles, no .env, no copied
node_modules and no reused artifact cache. A later transaction-reason allowlist
tightening was rechecked in the working tree. Initial sandbox attempts could not
access Hardhat's external compiler-cache lock or bind the loopback preview port;
approved retries completed. These were environment restrictions, not test passes.

## Reproduce

Use Node 22.22.2, as recorded in the root .nvmrc. From the repository root:

```sh
cd VotingDapp
npm ci --ignore-scripts
cd voting-frontend
npm ci --ignore-scripts
cd ..
npm run release:check
npm run audit:dependencies
npm test
npm run test:coverage
npm test
npm run benchmark:current
npm run deploy:local
cd voting-frontend
npm audit --audit-level=low
npm test
npm run test:coverage
npm run test:ui
npm run build
npx playwright install chromium
npm run test:browser
```

The second ordinary contract test run restores non-instrumented artifacts after
coverage. The coverage command excludes only the 24 KB runtime-size assertion,
because instrumentation enlarges bytecode; that assertion remains mandatory in
the full ordinary suite. Do not deploy or benchmark coverage artifacts.

Service coverage is 95.02% lines, 92.27% branches and 100% functions, covering only
src/lib/*.js, not JSX. Contract native coverage
reports lines/statements; no current exhaustive branch-coverage claim is made.
Seeded model tests use fixed seeds, not exhaustive fuzzing or formal verification.
Tests passing establishes exercised behavior, not correctness for every input.

## Tools and measurements

Hardhat 3.18.0; ethers 6.17.0; Solidity 0.8.20; optimizer disabled (runs setting
200); Paris EVM target. Frontend versions are resolved by its lockfile.
Exact source/lockfile hashes and final metrics are in
[evidence](evidence/release-checks.json).

The browser checks use an isolated headless Chromium profile and simulated
provider, never the user's browser tabs or MetaMask installation. Their coverage
is limited to specified layouts; populated views, keyboard/screen-reader flows,
actual RPC load, finality and wallet-extension edge cases need separate acceptance.

## Secret-scan boundary

The publication preflight inspects tracked plus unignored working-tree candidates
and rejects private/generated paths and selected credential patterns. Missing
working-tree files are treated as intended deletions, so stage/review deletions
before committing. It does not scan all history, forks, unreachable objects,
binary images or credential revocation. A clean result is not permission to
publish secrets or reuse previously exposed keys.
