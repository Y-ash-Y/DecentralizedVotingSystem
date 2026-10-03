# VoteChain security review — 2 October 2026

This is a source review plus automated verification by the implementation agent,
not an independent audit, penetration-test certification or approval for real
elections. It covers the application contracts, frontend service/UI code, build,
deployment/local-demo scripts and tests. Dependencies were scanned by npm; their
entire source trees were not manually audited. Private archives and old report claims are outside this application's sign-off.

## Threat model

Protect ballot-count integrity, authorized administration, one count per eligible
wallet per election, phase boundaries, recoverability of commit secrets, and
honest presentation of unavailable data. Assume attackers can call contracts
directly, supply invalid IDs, copy commitments, repeat submissions and observe
all public chain data. Also consider failed/misconfigured RPCs, stale UI responses,
chain reorganizations, compromised browsers and malicious enrollment authorities.

The protocol deliberately does not establish human identity, permanent ballot
secrecy, coercion resistance, censorship resistance or receipt-freeness. An
attacker controlling a voter's device/key can act as that voter. A compromised
enroller can register multiple wallets for one person or exclude eligible people.

## Resolved engineering findings

| Finding | Resolution and evidence |
| --- | --- |
| Backup loss after a single reveal receipt | Retain the backup; receipt inclusion is not finality. DOM regression checks retention. |
| Treating any returned receipt as success | Require status 1; handle only equivalent successful fee repricing; reject cancellation and changed calls. Service and DOM regressions. |
| Duplicate submits / stale selected sender | Synchronous in-flight guard; recheck signer address; disable disconnect while pending. DOM regressions. |
| Sensitive read, backup and transaction error payloads | Do not stringify raw wallet/RPC errors or malformed backup data. Known codes and exact contract-reason allowlists only. Redaction tests. |
| Large event pages crash spread operations | Iterate instead of argument spreading; explicit event and request budgets. 150k-page regression plus 250k synthetic workload. |
| Mixed/reorganized result snapshots | Pinned-block reads, checkpoint/tip rechecks, stale-request guards and explicit failure display. Service tests. |
| Aggregate turnout loses integer precision | Sum using BigInt and reject an unsafe display conversion. Regression test. |
| RPC network name mistaken for identity | Expected chain ID in configuration and pre-deployment checks for V1/V2. Mainnet/mislabeled RPC unit tests. |
| Local UI relaxation applied to ordinary V2 | Explicit fast-fixture flag plus code-hash/version/marker verification. Real local-EVM integration test. |
| Browser wall clock used for chain scheduling | Creation preflight reads latest block timestamp; contract remains authoritative at inclusion. |
| Low-contrast badges/notifications | Brighter text colors, keyboard-dismissable status notification; isolated browser/axe checks. |
| Extra external font request | Removed the remote font import; system fallback fonts. This does not hide RPC/wallet traffic. |

No confirmed critical/high application exploit was identified in this review.
That statement is limited to the inspected source and executed checks; it is
not a claim that no vulnerability exists.

## Slither findings and disposition

Slither 0.11.5 analyzed a **clean non-instrumented build** of three contracts with
101 detectors. Final result: 37 warnings, consisting of 3 low, 33 informational
and 1 optimization finding; no high or medium finding. The tool returns a nonzero
exit status when warnings exist, so this is not described as a warning-free scan.

| Detector | Count | Review disposition |
| --- | ---: | --- |
| timestamp (low) | 3 | Intentional schedule comparisons. Chain time is not a perfect wall clock; delayed inclusion and deadline misses remain real risks. Not randomness. |
| dead-code (informational) | 1 | `minimumPhaseDuration` is called by creation and overridden by the local fixture. Standard vs fast timing tests demonstrate use; retain the hook. |
| solc-version (informational) | 1 | Compiler pinned to 0.8.20. Review compiler issues before any new public deployment; warning is not suppressed. |
| naming-convention (informational) | 26 | Legacy underscore-prefixed parameter names. No authorization impact; keep V1 source compatibility. |
| unindexed-event-address (informational) | 5 | Legacy ABI limitation. V1 event scanner filters client-side; the current contract uses indexed addresses. Do not silently change V1 ABI. |
| immutable-states (optimization) | 1 | V1 owner could be immutable in a new design; not a correctness defect. V2 supports explicit transfer. |

An initial medium warning about the local `visible` boolean was addressed with
an explicit `false` initializer. Solidity already defaults a bool to false, so
this is clarity/tooling hygiene, not discovery of uninitialized memory corruption.
Stale intermediate build-info files are not used for the final scan.

The compiler warning named Yul verbatim deduplication, custom optimizer inlining,
and selector-side-effect issues. The reviewed sources have no inline assembly,
verbatim or selector access; optimizer and viaIR are disabled. Those triggering
patterns were not found. Newer compiler bug entries also reinforce why a scanner's
embedded list is not exhaustive. This is a source/configuration assessment, not
a blanket compiler safety waiver. See the [official Solidity bug catalog](https://docs.soliditylang.org/en/latest/bugs.html).

## Dependency advisory disposition — remediated locally

The reviewed Hardhat 3 / ethers 6 migration replaces the legacy dependency tree.
Both parent and frontend lockfiles report **0 known npm advisories**, including
development dependencies. Earlier counts (28 affected entries: 16 low, 4 moderate,
8 high) are superseded. No forced upgrade or advisory-suppressing override was used.

Validation includes clean installation, all normal tests, native contract coverage,
both deployment smoke tests, current gas fixtures and ABI checks, and isolated demo bootstrap/status/phase/overwrite-refusal checks.
CI now fails on known advisories of low severity or higher in either package.
See [verification](VERIFICATION.md) for versions and boundaries.

This is not a claim of zero vulnerabilities or a source audit of every dependency.
Supply-chain compromise, unpublished vulnerabilities and unsafe credentials remain
possible. Use dedicated testnet credentials; do not expose the simulator publicly.

## Residual risks and limitations

1. **Public ballot disclosure:** calldata/storage are observable; reveal discloses
   choice and secret. A gated getter does not hide a tally. No national/binding
   election claim is supportable, even if all existing tests pass.
2. **Centralized enrollment/governance:** no uniqueness proof, audited registration
   process, multisig policy or timelock. Owner transfer exists in V2's contract,
   but has no dedicated frontend workflow.
3. **Secret custody:** browser/download backups are plaintext. XSS, malicious
   extensions, shared devices, storage loss and two-tab races remain risks.
   React escapes displayed strings, but no end-to-end XSS or hosting-CSP audit
   has been established. A retained secret needs user-controlled safe disposal.
4. **Transaction recovery:** no persisted pending-transaction manager, cross-tab
   lock or finality monitor. Before retrying after a timeout, inspect wallet/chain
   history. Contract guards remain the actual defense against duplicate counts.
5. **RPC/data availability:** event-count checks are not a proof of all log
   completeness. A dishonest RPC may omit other event types. Browser memory
   grows with history until its cap; a trusted/indexed service or light-client
   design would have different operational trade-offs.
6. **Deadline availability:** immutable schedules prevent early admin closure,
   but cannot rescue lost secrets, missed reveals, congestion or censored voters.
   Unrevealed votes do not count, and selective abstention is possible.
7. **Unicode and scale:** names are byte-limited, not normalized identities;
   visually similar names are possible. Batches cap at 50 and candidates at 100;
   no production voter-load validation exists.
8. **Legacy V1:** no schedule enforcement, full eligibility freeze, ownership
   recovery, or V2 domain binding. Those deployed semantics cannot be repaired
   by changing a browser. Keep old reveals available during any eventual migration.
9. **Storage namespace:** legacy backup keys omit chain ID. The default local
   demo uses a separate origin; migrating to one shared origin needs explicit
   versioned backup migration and recovery testing.

## Secret hygiene check

No `.env` or `*.key` file was tracked in the checked repository; relevant ignore
rules apply. Pattern checks found no hardcoded Alchemy URL credentials, assigned
64-hex private keys or PEM private-key blocks in tracked working-tree text or
selected source/config diffs reachable from local Git refs. Values were never
printed. This is a limited pattern scan, not comprehensive secret discovery.
It does not verify deleted/unreachable objects, remote forks, screenshots, old
archives, untracked documents or whether previously exposed credentials were
actually revoked. Previously exposed wallet keys should remain permanently retired.

## Reproduction

Use a disposable source copy without a `.env` and a temporary Python environment
with `slither-analyzer==0.11.5`. Put a reviewed Solidity **0.8.20** executable named
`solc` on that shell's PATH and check `solc --version`. On the review machine this
was the compiler already downloaded by Hardhat. Set `VIRTUAL_ENV` to the temporary
environment so solc-select does not write into the user's normal configuration.

From `VotingDapp`:

```sh
node scripts/security-input.js > /tmp/votechain-security-input.json
slither /tmp/votechain-security-input.json --compile-force-framework solc-json
npm run test:coverage
npm test
```

Choose a unique temporary output path in shared environments. The exporter reads
all Solidity sources and includes the same optimizer-disabled / Paris settings
as the Hardhat configuration. Keep these settings synchronized if changing the
compiler configuration. No keys or wallet settings are exported.

The scanner's older Hardhat adapter cannot parse Hardhat 3's split build-info
format; use this direct standard-JSON path instead. The 2 October final-source recheck
again produced **37 findings: 0 high, 0 medium, 3 low, 33 informational,
1 optimization** across three contracts and 101 detectors. A findings exit code
is expected; inspect severity and dispositions rather than calling it warning-free.
The native coverage command excludes only the production byte-size assertion;
that assertion remains mandatory in the normal suite.

At the owner's request on 3 October, this portfolio release uses the internal
source review and automated checks documented here, with no external-reviewer
requirement. The separate audit-handoff document was retired. This does not change
the findings, scope limitations or absence of an independent audit.
