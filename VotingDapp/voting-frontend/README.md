# Wallet interface

This React/Vite package connects a MetaMask-compatible wallet to the configured
voting protocol. Contracts remain the authority for permissions and ballot state.

| Folder | Responsibility |
|---|---|
| [src/](src/README.md) | Application entry points and deployment selection |
| [src/lib/](src/lib/README.md) | Commitments, chain reads, transactions and validation |
| [src/components/](src/components/README.md) | Shared presentation components |
| [test/](test/README.md) | Node service tests |
| [test-ui/](test-ui/README.md) | Simulated-wallet component tests |
| [test-browser/](test-browser/README.md) | Browser smoke/layout checks |
| [scripts/](scripts/README.md) | Event-reading benchmark |

Use the root Node version and install from this directory with
`npm ci --ignore-scripts`. Keep this package's lockfile separate from Hardhat's.

For the interactive local demo, use `npm run demo:ui` from the parent package
after completing setup. The root [walkthrough](../../README.md#run-the-local-wallet-demo)
ensures the UI and disposable deployment match. Plain `npm run dev` is not a
replacement for deployment configuration.

## Checks

```sh
npm test
npm run test:ui
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests use a simulated wallet, not a real extension or public network.
Manual wallet/recovery cases remain separate. Vite exposes `VITE_` values to the
browser: never put private keys or secret RPC credentials in them. Ballot backups
are plaintext and must not enter Git.
