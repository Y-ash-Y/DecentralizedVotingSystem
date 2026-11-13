# Contract toolchain feasibility — 4 November 2026

This note records an isolated alternative-toolchain pilot. The repository
uses Hardhat with a [bounded Zod mitigation](../VotingDapp/patches/README.md)
and an independent strict dependency audit.

## Decision

Foundry/Anvil passed the functional pilot. Its native dependency review remains
incomplete, and the pilot covers only a subset of the contract suite. Hardhat 2
also produced more npm audit findings than the project's current toolchain.

## Compared options

| Option | Evidence | Conclusion |
|---|---|---|
| Hardhat 3.21.2 | Six high-severity npm dependency entries tracing to the Zod advisory | Strict audit fails |
| Hardhat 2.29.1 + ethers plugin 3.1.3 + Chai matchers 2.1.2 | Fresh isolated lockfile resolution reports 23 npm entries: 8 high, 4 moderate, 11 low; no overrides or forced fixes applied | Downgrading is not a clean fix and adds migration work |
| Foundry 1.9.0 / Anvil 1.9.0 + ethers 6.17.0 + Node's test runner | Native and JavaScript compatibility pilots pass; ethers-only npm tree has zero findings, but the native release workspace lock has Rust advisories | Viable architecture candidate, not a security-approved replacement |

These audit counts are affected dependency entries, not necessarily distinct
vulnerabilities, and the npm counts do not cover native binaries. Counts are
point-in-time observations, not a permanent security guarantee.

Hardhat 2 is also on an [announced end-of-life path](https://hardhat.org/docs/reference/hardhat-2-end-of-life).
Downgrading solely to remove Zod would exchange one problem for a broader old
dependency tree and a short-lived migration.

## Isolated functional pilot

The official [Foundry 1.9.0 release](https://github.com/foundry-rs/foundry/releases/tag/v1.9.0)
was downloaded for macOS ARM64 into a temporary directory, not installed globally.
Its archive SHA-256 matched the GitHub release asset digest:

```text
38f9af72b266c38ce2e4dfc659ae9cbd1f78c01b34738a76b6c4cb9610579426
```

This is a checksum check, not a completed Sigstore/attestation verification.
The local cached Solidity 0.8.20 compiler was reused. Compiler settings stayed
optimizer-disabled, runs 200, EVM Paris. All three copied contract sources were
checked unchanged against the project.

Observed results:

- 12 native Solidity tests passed, including a 256-run randomized plain-ballot
  test. The subset covers permissions, atomic batch rollback, sealed setup,
  exact phase boundaries, commit/reveal, copied-commitment rejection, commitment
  domains, ownership transfer, expired setup and the local fixture.
- Six JavaScript/Anvil checks passed: ABI compatibility, compiler output,
  frontend commitment hashing and reveal, plain voting and event decoding,
  node metadata/impersonation, and idle-block automatic phase progression.
- Full creation and deployed bytecode for the scheduled contract and the local fixture matched the
  existing ordinary Hardhat artifacts, including metadata. This observation is
  specific to the tested settings and paths, not a guarantee for every build.
- Anvil ran unforked on a temporary loopback port, not the user's demo port.
  It was stopped after the checks. No public chain, real wallet key, root `.env`,
  existing ballot/session data or account setup was needed.

Compatibility issues found rather than hidden:

1. Forge orders ABI entries differently. Sorting only the outer ABI array gives
   identical entries to the frontend ABI, but raw JSON hashes are order-sensitive.
   A migration must preserve the existing exported ABI or explicitly version the
   manifest hashing convention. It must not silently alter validation.
2. Anvil supports the `hardhat_metadata` RPC alias, but identifies itself as
   Anvil. The existing Hardhat/EDR-only demo guard intentionally rejects that
   identity. The guard must be deliberately adapted and negatively tested, not
   removed. Mixed mining supports instant transactions plus idle-block progress.
3. Coverage ran, but emitted source-anchor warnings. The small pilot does not
   exercise the legacy contract, and its coverage is not comparable to the
   current full suite. Coverage output needs investigation before becoming a
   replacement gate. Ordinary artifacts were restored after coverage.

## Native dependency check: still unresolved

The public [Foundry 1.9.0 Cargo.lock](https://github.com/foundry-rs/foundry/blob/v1.9.0/Cargo.lock)
was queried against [OSV's package/version API](https://google.github.io/osv.dev/post-v1-querybatch/).
All 1,130 registry package entries were queried, with pagination handling.
The 95 git-sourced entries were not scanned by this registry-only check.

Matches include `crypto-bigint` 0.5.5/0.7.5, `quick-xml` 0.39.4, `zip` 9.0.4,
`zstd` 0.13.3 and `zstd-safe` 7.3.0. `derivative` and `paste` also have
maintenance notices; those are not classified here as security vulnerabilities.
Examples of actual vulnerability records:

- [crypto-bigint timing variability](https://rustsec.org/advisories/RUSTSEC-2026-0387.html), patched in 0.7.6.
- [zip parser differential](https://github.com/advisories/GHSA-m665-v7pm-7grj), patched in 9.0.5.
- [zstd context-reuse data leakage](https://rustsec.org/advisories/RUSTSEC-2026-0391.html), patched in the 0.13 line at 0.13.4.

This is a whole-workspace lockfile screen, **not** proof that each affected API
is compiled into or reachable in Forge/Anvil. Feature/platform reachability,
git dependencies, native library dependencies and the shipped binary SBOM remain
unverified. Equally, these gaps are not grounds to declare the tools clean or
waive their advisories. npm audit alone would miss this dependency surface.

## Requirements before considering a migration

1. Establish a pinned Foundry release/build with an acceptable native dependency
   audit, verified provenance and reproducible Linux/macOS installation. Review
   feature reachability and git dependencies; do not silently ignore findings.
2. Port all existing contract cases, model-based checks and frontend/local-EVM
   integration cases with their assertions intact. The 12+6 pilot is not a
   replacement for the current 97-case contract suite.
3. Adapt demo setup, node identity/fork checks, restart detection, account
   impersonation cleanup and wallet session preservation. Keep real-wallet
   manual acceptance separate from simulated-wallet tests.
4. Adapt deployment/build-info readers, ABI/hash checks and both gas benchmarks.
   Keep Solidity/compiler settings fixed and recheck exact artifacts/runtime size.
5. Resolve coverage warnings and reproduce useful coverage for the full suite.
   Add a native dependency audit alongside both npm audits in CI before removing
   Hardhat; retain the frontend service/UI/browser checks.

Foundry remains a candidate once its native dependency and provenance review
is complete. The pilot leaves the current Hardhat workflow in use.
