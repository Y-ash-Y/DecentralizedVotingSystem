# VoteChain

**Wallet-authorized, auditable voting on Ethereum.**

VoteChain is a full-stack voting application built with Solidity, React and
ethers.js. Administrators create elections, register candidates and enroll voter
wallets. Voters cast plain ballots or use commit–reveal voting, and anyone can
inspect the public blockchain record.

This project demonstrates smart-contract authorization, scheduled state
transitions, transaction reliability, ballot recovery and reproducible testing.
It is a **non-binding educational and portfolio application**, not certified
infrastructure for government or binding institutional elections.

## Features

- **Wallet-based access:** administrator and voter views follow the connected
  account; smart contracts enforce permissions independently of the interface.
- **Election administration:** candidate and voter batches, delegated election
  administrators, role revocation and two-step ownership transfer.
- **Sealed setup:** candidate and eligibility lists become immutable before voting.
- **Scheduled phases:** voting, reveal and closing follow blockchain timestamps.
  Positive whole-second intervals are supported; short windows require care.
- **Two ballot modes:** direct public voting or domain-separated commit–reveal
  ballots with cryptographically random secrets.
- **Recovery-aware transactions:** save-before-sign backups, successful-receipt
  checks, equivalent fee-replacement handling and duplicate-submit protection.
- **Auditable results:** bounded event pagination, reorganization-aware caching,
  consistent tally snapshots, ties and zero-turnout outcomes.
- **Automatic local demo:** blocks and phase checks run every two seconds, so
  scheduled elections progress while wallets are idle.

## How voting works

1. The administrator creates an election with its mode and schedule.
2. Candidates and eligible wallet addresses are registered.
3. The administrator reviews and seals setup before the start time.
4. During voting, each eligible wallet submits one ballot or one commitment.
5. For commit–reveal elections, voters return during the reveal window with the
   matching candidate and secret. Unrevealed commitments do not count.
6. After closing, the interface displays the counted results.

A commitment is a hash that binds the choice and secret to the wallet, election,
contract and chain. It temporarily conceals the choice; revealing publishes it.
An address alone is not a login credential—the voter must control its wallet.

## Technology

| Layer | Tools |
| --- | --- |
| Smart contracts | Solidity 0.8.20, Ethereum EVM |
| Contract development | Hardhat, ethers.js, Mocha, Chai |
| Interface | React, Vite, JavaScript |
| Wallet integration | MetaMask-compatible Ethereum provider |
| Testing | Local-EVM integration, Node tests, Vitest, Testing Library, Playwright |
| Security checks | Slither, dependency advisory scans, publication preflight |
| Continuous integration | GitHub Actions |

The interface delegates commitment handling, deployment validation, event reads,
transaction receipts and result calculation to focused service modules. The
contract is the final authority for every state-changing action.

## Run the local wallet demo

### Requirements

- Node.js **22.22.2** (recorded in `.nvmrc`), npm and MetaMask.
- Two dedicated wallet accounts: one administrator and one voter.
- Use **public addresses only** in setup commands. No keys or seed phrases are
  needed, and the local ETH balance has no monetary value.

From the repository root, install both dependency trees:

```sh
cd VotingDapp
npm ci --ignore-scripts
cd voting-frontend
npm ci --ignore-scripts
cd ..
```

In **terminal 1**, leave the local blockchain running:

```sh
npm run demo:node
```

In **terminal 2**, from the same `VotingDapp` directory, replace the placeholders
with your public addresses:

```sh
npm run demo:setup -- <ADMIN_PUBLIC_ADDRESS> <VOTER_PUBLIC_ADDRESS>
npm run demo:ui
```

Open **http://127.0.0.1:5174** and confirm the **LOCAL TEST ONLY** banner.

| MetaMask network field | Value |
| --- | --- |
| Name | VoteChain Local Demo |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency | ETH |
| Explorer | Leave blank |

Create an election with enough setup time, add candidates and voters, then
**seal setup before its start**. Keep the node running and the computer awake.
Voting, reveal and closing appear automatically as blocks cross their deadlines;
no administrator phase transaction or manual clock command is required.

Restarting the local node discards its in-memory elections. The setup script
detects stale session metadata and refuses to overwrite elections on the same
running node. Preserve any ballot backups you still need. See the
[wallet walkthrough](docs/MANUAL-WALLET-TESTS.md) for acceptance and recovery cases.

## Tests and build

From `VotingDapp`:

```sh
npm test
npm run test:coverage
npm test
npm run release:check
npm run benchmark:current
cd voting-frontend
npm test
npm run test:ui
npm run build
```

The second ordinary contract run restores non-instrumented artifacts after
coverage. Automated tests need no wallet, API key or testnet funds.

Browser smoke tests use an isolated simulated wallet:

```sh
npx playwright install chromium
npm run test:browser
```

The recorded checks include **97 contract/local-EVM cases, 52 service cases and
29 simulated UI cases**. A separate 96-case instrumented run reports 100%
contract lines/statements. Three browser viewport cases have a separate dated
checkpoint; they are not included in the 178-case total. See
[verification](docs/VERIFICATION.md) for exact dates, execution limits and status.
Coverage and passing tests are not security proofs.

## Measured gas cost

Authorizing ten fresh addresses in a single batch used **311,139 gas**, compared
with **621,530 gas** across individual transactions: **49.94% less** in the
controlled local fixture. A one-address batch costs slightly more because of
array overhead. These are execution-cost measurements, not live throughput
guarantees. Reproduce and interpret them using [benchmarks](docs/BENCHMARKS.md).

## Sepolia deployment

The local demo is the reference workflow for the scheduled voting protocol.
For Sepolia, deploy the intended contract and configure the browser from its
actual deployment manifest: address, protocol/ABI selection, deployment block
and runtime-code hash must agree. Follow the
[deployment and recovery guide](docs/DEPLOYMENT.md); do not assume that an
arbitrary configured address supports every feature above.

Deployment credentials belong only in the ignored repository-root `.env`.
Use the supplied environment templates and a dedicated testnet wallet.
Never place private keys or secret RPC credentials in public `VITE_` variables.

## Security and scope

- Commit–reveal delays disclosure; it does **not** provide anonymity, permanent
  secrecy, receipt-freeness or coercion resistance.
- Wallet enrollment is trusted. One wallet is not proof of one eligible person.
- Browser and downloaded ballot backups are plaintext. Losing a secret or missing
  a reveal deadline can prevent a ballot from being counted.
- RPC outages, compromised devices, chain reorganizations and dishonest enrollment
  remain operational risks.
- The project has internal source review and automated security checks, not an
  independent audit or production-election certification.

Keep `.env`, keys, ballot backups, local sessions, dependencies and generated
output out of Git. Previously exposed credentials must be retired; adding an
ignore rule does not revoke them. See [security review](docs/SECURITY-REVIEW.md).

## Repository layout

```text
VotingDapp/
  contracts/          Voting contracts and local-only fixture
  scripts/            Deployment, demo, benchmark and security utilities
  test/               Contract and local-EVM integration tests
  voting-frontend/
    src/components/   Shared interface components
    src/lib/          Chain reads, commitments, transactions and validation
    test/             Service tests
    test-ui/          Simulated interface tests
    test-browser/     Browser smoke and layout checks
docs/                 Architecture, security, deployment and verification
.github/workflows/    Continuous integration
```

## Documentation and licensing

[Architecture](docs/ENGINEERING.md) ·
[Deployment](docs/DEPLOYMENT.md) ·
[Wallet testing](docs/MANUAL-WALLET-TESTS.md) ·
[Verification](docs/VERIFICATION.md) ·
[Benchmarks](docs/BENCHMARKS.md) ·
[Security](docs/SECURITY-REVIEW.md)

The repository contains existing mixed license declarations: the root
[LICENSE](LICENSE) is MIT, while the nested [project license](VotingDapp/LICENSE),
Solidity source headers and package metadata declare MPL-2.0. These declarations
are preserved; consult the relevant files rather than assuming one uniform license.
