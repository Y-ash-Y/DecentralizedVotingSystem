# Contract development and local demo

This is the Hardhat package. The browser application has its own
[package and lockfile](voting-frontend/README.md).

| Folder | Responsibility |
|---|---|
| [contracts/](contracts/README.md) | Voting protocols and the local test fixture |
| [scripts/](scripts/README.md) | Local demo, deployment, benchmarks and release preflight |
| [test/](test/README.md) | Contract, model-based and real local-EVM integration tests |
| [voting-frontend/](voting-frontend/README.md) | React wallet interface and browser/service tests |

Use Node.js from the root `.nvmrc`. From this directory:

```sh
npm ci --ignore-scripts
npm run deps:patch
npm test
npm run release:check
```

`npm test` explicitly selects the simulated Hardhat network. It does not require
a wallet key, RPC credential or funds. For the interactive demo, use the root
[two-terminal walkthrough](../README.md#run-the-local-wallet-demo).

`hardhat.local.config.js` is the isolated demo configuration. The regular
configuration also describes Sepolia and reads the ignored root `.env`; public
deployment is a separate intentional operation, never an installation step.

Compiled artifacts, cache and `.votechain-local/` metadata are local working
state. Do not delete ballot recovery data or a running demo's session metadata
as routine cleanup. License declarations are documented in the root README.

The [pinned Zod patch](patches/README.md) is an explicit local mitigation, not
an audit exemption. `npm test` reapplies/verifies it and runs tooling regressions
before the contract tests. Installation with `--ignore-scripts` does not apply
it automatically; run `npm run deps:patch` before other direct Hardhat commands.
