# Deployment and recovery runbook

## Current status

V2 is implemented and tested locally, **not deployed to Sepolia** by this work.
The default frontend remains on V1. Do not copy an ephemeral Hardhat address into
a Sepolia configuration. A new V2 address cannot display or migrate V1 elections.

New builds use Hardhat 3.18.0 and ethers 6.17.0. Runtime metadata hashes differ
from old builds despite identical executable contract code. Always use the actual
deployment manifest; never replace an existing deployment's expected hash with a
new local artifact hash. See [verification](VERIFICATION.md).

## No-funds rehearsal

From `VotingDapp`, after installing both dependency trees:

```sh
npm test
npm run benchmark:current
npx hardhat run scripts/deploy-v2.js --network hardhat
```

The in-process chain disappears when the command exits. The script prints a
manifest but intentionally does not save a durable manifest for that chain.
`localhost` deployment is also supported for contract development; the current
default browser configuration remains Sepolia. For isolated real-MetaMask tests,
use the explicit local V2 mode in [manual testing](MANUAL-WALLET-TESTS.md).

## A separately authorized testnet deployment

1. Finish advisory review and review the release gates first. Use a dedicated
   testnet wallet, never a wallet holding real assets. Retire any previously
   exposed private key; adding it to `.gitignore` is not key rotation.
2. Set `SEPOLIA_RPC_URL` and `PRIVATE_KEY` in the ignored repository-root `.env`.
   Do not print or paste their contents. `ETHERSCAN_API_KEY` is not required to
   deploy. No verification plugin is installed; the former inactive Etherscan
   config was removed during the toolchain migration. Your ignored API key is
   untouched. Do not assume `hardhat verify` is available.
3. Confirm wallet, chain ID 11155111, funding, compiled source and intended owner.
   The deployer becomes super-admin. Agree on deadline and eligibility policy.
4. Run only after deciding to spend testnet funds:

   ```sh
   cd VotingDapp
   npx hardhat run scripts/deploy-v2.js --network sepolia
   ```

5. Inspect the receipt and `deployments/11155111/<address>.json`. It records the
   address, protocol, receipt block, transaction hash, runtime-code hash, ABI hash,
   compiler and network. It is public metadata, not a secret. Files are append-only.
6. Independently read the deployed code, `protocolVersion()` and `superAdmin()`.
   Source verification is a separate release gate; it has not been performed.
7. Set the following *public* values in
   `VotingDapp/voting-frontend/.env.local` using the actual saved manifest:

   ```dotenv
   VITE_PROTOCOL_VERSION=2
   VITE_CONTRACT_ADDRESS=<manifest address>
   VITE_DEPLOYMENT_BLOCK=<manifest deploymentBlock>
   VITE_EXPECTED_CODE_HASH=<manifest runtimeCodeHash>
   ```

8. Restart/rebuild the frontend. V2 refuses incomplete configuration, wrong
   network, missing code, runtime-hash mismatch or wrong protocol version.
   VITE variables are compiled into public browser code: **never put wallet keys
   or a private RPC API key there**.
9. Run non-binding demo elections with separate owner/delegate/voter wallets.
   Verify both modes, non-authorized rejection, phase boundaries, secret backup,
   ties and final tally. Retain receipt links and screenshots without secrets.

## Operating a scheduled election

Choose local calendar times with enough setup margin. The contract uses Unix
seconds and chain time, not the browser clock. New builds from 2 October 2026
allow any positive whole-second voting/reveal interval; one-minute windows are
valid. Very short windows risk missed inclusion and uncounted reveals. Previously
deployed standard contracts still enforce one hour: deploy a new contract and
configure its actual manifest to use the new policy. Existing elections cannot
be changed. The frontend checks the selected deployment's minimum before sending.
Add two or more candidates and the eligible voter list, reviewing
each batch of at most 50 entries. A maximum of 100 candidates is enforced.

Verify eligibility and candidate spelling before **Seal Setup**. Sealing freezes
both lists permanently. The scheduled phases then require no administrator
transactions. Unsealed setup expires at start. Cancellation is possible only
before sealing and before start. No early end or extension exists.

Voters must select their own enrolled wallet in MetaMask. An address alone is not
a login credential. Do not distribute private keys as voter IDs. Prepare and
download a private secret backup, submit early, check the receipt, and return
during the reveal window. An unmined/pending transaction has not cast a vote.

## Recovery and rollback

| Symptom | Safe response |
| --- | --- |
| Deployment command failed | Inspect the deployer's transaction history first; the chain transaction may have succeeded even if manifest writing failed. Do not blindly deploy twice. |
| UI deployment mismatch | Compare chain/address/receipt/code hash with the reviewed manifest; do not disable checks to make the error disappear. |
| Event history unavailable | Check RPC and receipt block. Switch RPC if needed; never invent missing votes or truncate the history window. |
| Commit rejected or pending | Preserve the saved ballot. Inspect wallet history/receipt before retrying; the UI reuses the existing secret/candidate. |
| Lost local storage | The reveal form accepts the exact candidate and secret from the private JSON backup. There is no automatic import yet. Check its chain, contract, election and wallet first. |
| Lost secret and no backup | It cannot be reconstructed from the hash. The committed vote cannot be revealed. |
| Compromised owner key | Use reviewed owner-transfer procedures if still possible, revoke explicit old roles, warn users and halt reliance on the demo. Transfer needs successor acceptance; there is no configured multisig/recovery service. |
| RPC outage at deadline | Document the failure. V2 has no extension/override; a pending vote may be excluded. |

Frontend rollback means restoring a reviewed frontend/configuration that matches
the same protocol. It cannot roll back chain state. Keep the prior V1 URL and
configuration available until all outstanding V1 reveals are finished. Do not
delete browser backups, rewrite local storage keys or point V1 commitments at V2.

No branch push, source verification, public hosting or testnet deployment is
implicit in this runbook.
