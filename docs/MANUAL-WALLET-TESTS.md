# Manual MetaMask acceptance log

## Final local walkthrough accepted — 3 October 2026

After the automatic-mining fix and fresh-start instructions, the owner reported
"all works fine, test passed" and requested project completion. Record the current
local walkthrough and automatic scheduling as USER-CONFIRMED PASS. The earlier
commit/backup/reveal/tally walkthrough was also user-confirmed.

This is the owner's observation, not an independently observed extension run.
It does not establish that every adversarial case below was individually tested,
particularly pending-transaction speed-up/cancellation, or that public-network
acceptance or independent audit sign-off occurred. Those claims remain excluded.

## Initial role checks: user-confirmed, September 2026

The user performed these checks in Firefox with the real MetaMask extension and
reported all three passing: admin dashboard with the admin wallet, no admin
access from the voter wallet, correct selected-election voter address/eligibility.
These are user-observed results, not an automated extension test. The subsequent
commit–reveal happy path is recorded below. The user handles all wallet approvals.

## Isolated local setup

From `VotingDapp`, keep a local node running in one terminal:

```sh
npm run demo:node
```

In a second terminal, use PUBLIC addresses, never private keys:

```sh
npm run demo:setup -- <admin-public-address> <voter-public-address>
npm run demo:ui
```

`hardhat.local.config.js` does not load deployment credentials or configure any
public network. Bootstrap assigns fake local balances and temporarily uses
Hardhat impersonation to deploy as the supplied admin; impersonation is stopped
before the wallet tests. This bootstrap is not evidence of a wallet signature.
Subsequent user actions must be signed in MetaMask. No keys need to be imported.

New setup deploys the **local-only fixture**: phase intervals must be positive.
The current standard contract also permits short windows; older deployments
retain their original policy. Do not assume an existing session has been upgraded.
Stop its UI before deliberately reinitializing. To replace a session on the same node, use
`npm run demo:setup -- <admin-public-address> <voter-public-address> --replace-empty`.
This refuses replacement when elections exist and archives the previous manifest.
Then restart `npm run demo:ui`. Never reset a node with election data you need.

The generated `.votechain-local/session.json` is ignored by Git. Commands verify
loopback RPC, chain 31337, unforked Hardhat/EDR metadata, node instance ID and code
hash. A restarted node invalidates the old session. Never expose port 8545 publicly.

Open http://127.0.0.1:5174/ for V2; 5173 remains the separate V1 page. Verify the
**LOCAL TEST ONLY** banner. Local mode requires explicit opt-in and development
mode; it is rejected in production builds. No `.env` is overwritten.

| MetaMask network field | Value |
| --- | --- |
| Name | VoteChain Local Demo |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency | ETH |
| Block explorer | Leave blank |

Balances on this chain are valueless. Never send ETH from another network to
fund it. Use dedicated project wallets; no seed phrase or private key is needed.

## Commit–reveal checklist — successful flow user-confirmed, 2 October 2026

The user reported completing the eight-step retry walkthrough, including setup,
commit, backup, reveal and final tally, with MetaMask. This is user-observed local
acceptance, not independent browser observation or a public-network test. The
reject/retry case in the fuller checklist below was not separately confirmed.
The new standard-contract timing policy still requires a new public deployment.

1. Connect admin on port 5174, local network. Expect an empty election list.
2. Create `Wallet Test`; enable commit–reveal. Choose a future start allowing
   enough time to finish setup, then later commit/reveal closing times. In the
   local fixture these may be only a minute apart; no hour-long wait is needed.
   Allow enough time for setup and wallet approvals.
3. Select it; batch-add Alice, Bob, Simran, Raj and authorize the voter address.
4. Review the lists and click Seal Setup. State stays Created until start;
   candidates and eligibility must no longer be editable.
5. Wait until the scheduled start. New demo nodes mine blocks every two seconds;
   the local UI polls every two seconds and opens the commit phase automatically.
6. Switch to voter, reconnect, select a candidate. Reject the first commit request
   in MetaMask. Expect an error and no recorded commitment.
7. Retry the same candidate and approve. Download the private backup, refresh and
   verify committed status. Do not share the backup or its secret.
8. Wait for the scheduled reveal phase, load saved ballot, then reveal.
9. Wait for the scheduled end and compare UI and contract totals:
   the chosen candidate should have 1, others 0.

Since 3 October 2026, fresh demo nodes produce idle blocks automatically. Keep the
node running and the computer awake; page timers can be throttled in background
tabs. An older already-running node must be restarted deliberately to load the new
configuration; restarting loses its in-memory elections. Preserve any needed data
first, rerun demo:setup and demo:ui, then create new future schedules. Do not restart
a node with elections you still need. This change does not alter public networks.

`npm run demo:phase -- 1 active` (or reveal/ended) remains an optional test shortcut,
not a required administrator action. It jumps the clock ahead; after a jump, future
forms must use chain time, which may now be ahead of your laptop clock. These
commands are not available on public networks.

`npm run demo:status -- 1` reads current phase/setup metadata without a transaction.
Clock advancement affects ALL elections on the local chain and cannot go backward.
For later fixtures, choose dates later than the local-chain clock. Restarting and
reinitializing loses local elections, not Sepolia data. Save desired evidence first.

Remaining manual checks: plain vote, unauthorized rejection, delegated-role
revocation, wrong-chain recovery, pending/replaced transaction, ties and no turnout.
Record actual outcomes; unit tests are not substitutes for these wallet checks.

When finished, stop local UI/node with Ctrl-C and switch MetaMask back to the
desired network. Do not clear unrelated wallet history or other sites' storage
as a routine test workaround.

## Remaining acceptance matrix — not yet signed off

Use this table to record real extension observations separately from simulated
tests. For each run record date, source revision, browser/MetaMask versions, chain,
public contract address, election ID and PASS/FAIL with the exact safe error text.
Never paste a private backup, secret, seed phrase, key or full sensitive RPC error.
Use only dedicated wallets and valueless local balances. Redact screenshots.

| ID | Real-wallet case | Expected observation | Status |
| --- | --- | --- | --- |
| W00 | Fresh local scheduled walkthrough with automatic phase progression | No manual phase command needed while node is running | User-confirmed pass, 3 October |
| W01 | Unenrolled wallet selects an active election | No selectable voting action; a direct contract call must revert (covered separately by EVM tests) | Pending |
| W02 | Reject a commit request, then retry the same candidate | First request records no commitment; private saved ballot remains unchanged; retry counts once | Pending |
| W03 | Refresh after a confirmed commit, then reveal using Load saved | Matching candidate/secret recover; exactly one reveal counts; backup remains | Pending |
| W04 | Reject reveal, then retry within the window | Rejection does not count; retry counts once without losing backup | Pending |
| W05 | Use a wrong candidate or wrong secret in reveal | Reject/revert with no count; correct original backup still works | Pending |
| W06 | Try an already-counted plain vote or reveal again | UI blocks repeats; direct repeats revert in EVM tests | Pending |
| W07 | Switch account and network while idle | UI reloads/requires reconnection; shows only the selected account's state; no wrong-chain write | Pending |
| W08 | Double-click a submission while confirmation is pending | One submitted call; disconnect blocked; no duplicate count | Pending |
| W09 | Speed up an equivalent pending call | Successful replacement receipt is accepted; exactly one count | Pending |
| W10 | Cancel or replace a pending call with a different call | No success for the intended ballot; inspect actual chain history before retrying | Pending |
| W11 | Reload or switch account during a pending call | No claim of a persistent transaction queue; manually reconcile history before retry; backup retained | Pending |
| W12 | Plain election, tie, zero turnout and missed reveal | Correct mode; joint leaders/no winner/uncounted unrevealed ballot displayed truthfully | Pending |
| W13 | Delegate grant/revocation and setup freeze | Revoked admin cannot write; sealed candidate/voter lists cannot change | Pending |

The original successful commit–reveal walkthrough is already user-confirmed. It
does not automatically mark each adversarial case above as passed. Simulated
coverage includes equivalent/cancelled/changed/failed replacements, reject/retry,
component-remount recovery, unenrolled voting controls and wrong-network recovery.
The simulated fixture now applies vote effects only on successful receipts.

### Round 1: rejection and recovery

1. Start the local node if stopped. Reuse a valid session; if it belongs to an old
   node, run demo:setup with the two public addresses to create a fresh local
   session. The script archives old metadata and refuses overwriting elections
   on the same running node. Do not bypass that guard.
2. Run demo:ui, open http://127.0.0.1:5174 and confirm LOCAL TEST ONLY / chain 31337.
3. Create a new commit–reveal election named Wallet Edge Cases. Allow generous
   windows for testing (for example start +10 minutes, commit close +30 minutes,
   reveal close +50 minutes relative to current chain time). There is no one-hour
   minimum in a new contract. Longer windows avoid rushing the checklist.
4. Add Alice and Bob, authorize the voter but not the admin, and seal setup.
5. Wait for the scheduled start and confirm the UI changes to Commit automatically.
   No phase command or administrator transaction is required.
6. As the unenrolled admin, open Voter View and confirm voting is unavailable.
7. Connect the authorized voter, choose Alice and reject Commit in MetaMask.
   Verify rejection, no recorded commitment and preservation of the saved ballot.
8. Retry Alice and approve. Download the private backup and keep it off Git.
   Reload, reconnect the same account and confirm commitment status. Do not reveal
   until moving to Round 2. Report only W01/W02 and the reload observation.

### Round 2: reveal failure and retry

Wait for the scheduled reveal phase, then Load saved. Privately keep the
original backup. Try a deliberately wrong candidate/secret; expect rejection
without a counted vote (the wallet may reject during estimation before signing).
Load the correct saved ballot again. Reject the first correct Reveal request in
MetaMask, then retry and approve. Wait until ended and check Alice=1, Bob=0.
Never send the secret as evidence. Once revealed, the original on-chain secret is
public, but the private backup still should not be published.

### Round 3: network, pending transactions and remaining modes

Use new disposable elections; ended elections cannot reopen. Record W06–W13
individually. An automining local node may confirm too quickly for Speed up or
Cancel. In that case mark W09/W10 NOT EXERCISED, not passed. A controlled pending-
transaction fixture must first verify the unforked loopback chain and restore
mining afterward; do not disable mining or manipulate nonces on a public network
just to satisfy this checklist. Ask for guided setup for these cases.

Do not delete active election/backup data to test storage loss. Use a dedicated
disposable origin/profile and a privately preserved backup if testing loss/import.
