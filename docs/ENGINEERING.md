# Engineering and security notes

## Deployment compatibility

The earlier contract and default deployed address remain unchanged. The current
scheduled contract is an explicitly selected new deployment, not a migration of existing elections. No live deployment or transaction
was performed in this work. This is engineering hardening, not an independent audit.

## Architecture and responsibilities

`React UI → service modules → Ethers BrowserProvider → wallet RPC → versioned contract`

- `src/lib/commitments.js`: random secrets, earlier-protocol/current-protocol hash encoding, durable backups.
- `src/lib/chainData.js`: deployment discovery, paginated logs, checkpoint cache,
  bounded concurrency and snapshot-based tally reads.
- `src/lib/deployment.js`: chain/code/version verification and scheduled state/role reads.
- `src/lib/results.js`: empty results, zero turnout, joint or unique highest tallies.
- `src/lib/errors.js`: allowlisted read/backup/connection error presentation.
- `src/lib/transactions.js`: successful receipts, conservative fee-replacement
  handling and sanitized transaction-error messages.
- `src/components/presentation.jsx`: shared controls, chart, navigation and sidebar.
- `src/app.jsx`: wallet interaction, form and selection state, and remaining views.
  It is still large; further view/hook extraction is a release-quality improvement.
- `contracts/VotingV2.sol`: schedule, setup freeze, roles, domain commitments and tally.
- `scripts/deploy-v2.js`: new contract and append-only public deployment manifest.
- `test/FrontendIntegration.js`: actual ethers-v6 helpers/ABI on a local EVM,
  using the same ethers-v6 generation as the migrated development tooling.

## Scheduled state machine

The scheduled contract's effective state is computed from block timestamp. Ethereum does not run a
background timer. A sealed election reads Created before start; Active from
start inclusive until votingEnd exclusive; Reveal until end exclusive for
commit–reveal; Ended thereafter. Plain elections end at votingEnd. Unsealed
setup becomes Cancelled at start. Optional marker events do not determine state.

The UI therefore reads `getElection` rather than assuming an ElectionStarted
event means voting is active. While connected, metadata refreshes every two seconds
in the local demo and every 15 seconds on Sepolia when no local write is underway.
Overlapping polls within an active timer are skipped. Fresh demo nodes mine empty
blocks every two seconds while retaining immediate transaction mining. The normal
test-network configuration and public networks are unchanged. RPC failure leaves an error and blocks
verified voting state; it is not evidence that an election does not exist.
Transactions are checked again by the contract at inclusion time, not button-click time.

Setup requires two candidates and one voter before sealing. Sealing freezes both
lists immediately. New standard-contract builds permit any positive whole-second
voting/reveal interval, including one minute; old deployments retain their previous
minimum. Short windows can exclude voters through transaction delays. No sealed-election
cancellation or early end is permitted. This trades administrator discretion for the risk of missed deadlines.

`VotingSystemLocalTest` is a separately named chain-31337-only fixture with a
one-second positive-interval minimum. It is not deployed by the public-network
script. Its fast UI mode requires a development build, explicit local flag,
manifest bytecode hash and a successful `localTestMode()` read. As of 2 October 2026,
new standard builds use the same positive-duration policy; an old standard contract
does not change when the source is edited. Creation checks
the latest chain timestamp rather than relying on the computer's wall clock.

Names are 1–100 UTF-8 bytes and must contain a byte greater than ASCII space.
Duplicate candidates are exact-byte duplicates, not Unicode-normalized identities.
Batch size is 1–50; candidate total is at most 100. Eligibility still trusts the
enroller. A zero-address voter is rejected and duplicate authorization is idempotent.

## Governance

Only the current super-admin creates elections and grants/revokes election admins.
Delegates manage their assigned elections. The UI checks `isElectionAdmin` per
election; the contract independently authorizes every write.
Owner transfer is nomination plus successor acceptance. Old implicit owner rights
disappear; separately granted delegate rights remain until revoked.
There is no timelock or configured multisig. Ownership transfer is contract-level,
not yet a dedicated UI workflow. Voter revocation is allowed only before sealing.

## Commitment protocol

The earlier deployment keeps `keccak256(abi.encodePacked(candidateId, stringSecret, voter))`.
The current contract computes:

```text
keccak256(abi.encode(
  COMMITMENT_TYPEHASH, block.chainid, contractAddress,
  electionId, voterAddress, candidateId, bytes32Secret
))
```

The fixed type discriminator is the hash of:
`VoteChainCommitment(uint256 chainId,address verifyingContract,uint256 electionId,address voter,uint256 candidateId,bytes32 secret)`.

This is domain-separated hashing, not EIP-712 signing. Frontend and contract
encoding are cross-checked on a real local EVM. New secrets use cryptographic
randomBytes(32). Storage is written and read back before requesting a wallet
signature. Rejected/uncertain writes preserve the saved ballot; retries reuse it.
A different candidate cannot silently overwrite it.

Transaction submission has a synchronous in-flight guard and checks the selected
signer's address again. Only status-1 receipts are success. Equivalent successful
repricing is accepted; cancellation or changed calldata/value/destination is not.
Disconnect is disabled during the pending operation. Reveal backups are retained:
one receipt is inclusion, not finality. There is still no cross-tab submission
lock, persisted pending-transaction reconciliation or automatic finality monitor.

Existing backup keys and manually chosen secrets remain recoverable. The current contract requires bytes32
secrets. Downloaded JSON includes election, chain, contract, wallet, candidate and
secret. It is sensitive and unencrypted. XSS, shared devices, clearing storage,
two-tab races and loss of the download remain risks. A reviewed backup-import and
pending-transaction reconciliation workflow remains to be built.

## Event history and consistency

The reader finds the creation block by historical-code binary search or uses a
configured receipt block. Discovery assumes no destroy/redeploy path. Pages
default to 10,000 blocks, shrink for recognized range limits and stop at a
20,000-request budget and 250,000-event budget. Authentication, rate-limit and outage errors surface.

Concurrent reads coalesce; a 12-second in-memory cache retains a checkpoint and
rescans the latest 12-block suffix. A changed checkpoint triggers full resync.
Tip checks reject detected mid-scan reorganizations. Election creation counts
are compared with electionCount; this is not a completeness proof for every event.
RPC honesty, historical-state availability and O(event count) browser memory
remain dependencies. This is not a light client or consensus-finality proof.

Tallies use a pinned block and at most eight concurrent calls. Every candidate
must succeed; any failure clears the result and produces an error. Unsafe integer
conversion is rejected. Metadata uses a separate pinned block; events and metadata
are not one atomic whole-page snapshot. Transaction validation is authoritative.
Selection/request versions prevent stale results from overwriting a new selection;
election-list requests are invalidated on disconnect.

## Threat model and honest limitations

- Enrollment is trusted; wallet uniqueness is not human uniqueness.
- Commit–reveal is temporary hiding with a strong secret, not anonymity or coercion resistance.
- Private storage and a gated tally getter are not confidentiality mechanisms.
- Reveals expose choice, secret and sender; unrevealed commitments do not count.
- The scheduled protocol removes arbitrary phase shortening but not censorship or missed deadlines.
- Earlier deployments retain manual phases and their limitations; new source cannot repair old elections.
- Hash/version checks detect configured deployment mismatch, not malicious UI code.
- No independent audit, formal proof, realistic load certification or binding-election approval exists.
- Test counts and a clean browser advisory scan do not establish system security.
- Previously exposed wallet keys must be retired; this pass did not verify remote forks or key custody.

For measured test outcomes, toolchain advisories and unverified areas, see
[verification](VERIFICATION.md); for operational procedures see [deployment](DEPLOYMENT.md).
