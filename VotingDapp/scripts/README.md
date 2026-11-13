# Deployment, demo and verification utilities

Run npm commands from the parent [Hardhat package](../README.md).

| Files | Purpose |
|---|---|
| `local-demo.cjs`, `local-demo-lib.cjs` | Disposable local setup, session validation and UI configuration |
| `deploy-v2.js`, `deploy.js` | Deployment scripts for scheduled and manually advanced elections |
| `deployment-network.cjs`, `security-input.js` | Network/input guards |
| `benchmark-v2.js`, `benchmark.js` | Controlled local gas comparisons |
| `build-info.js` | Build/deployment information |
| `check-release.js` | Read-only working-tree publication preflight |
| `patch-zod.cjs` | Explicit hash-checked Zod v3 bounded-collection mitigation; does not waive audits |

For the supported demo use `npm run demo:node`, then `npm run demo:setup --
<ADMIN_PUBLIC_ADDRESS> <VOTER_PUBLIC_ADDRESS>` in another terminal. Supply public
addresses only, never keys or seed phrases. Follow the root
[walkthrough](../../README.md#run-the-local-wallet-demo) in full.

Deployment scripts can write to a selected chain. Do not run a public-network
deployment as a smoke test. Test automation and gas benchmarks use the explicit
simulated Hardhat network. Any Sepolia deployment needs the separate
[deployment procedure](../../docs/DEPLOYMENT.md).

The release checker reports filenames/rules without printing secret values. It
does not revoke exposed credentials or prove old history and forks are clean.
