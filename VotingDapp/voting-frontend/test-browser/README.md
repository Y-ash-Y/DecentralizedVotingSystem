# Browser smoke checks

From the frontend directory:

```sh
npx playwright install chromium
npm run test:browser
```

[smoke.spec.js](smoke.spec.js) uses an isolated simulated wallet. The Playwright
configuration builds the ordinary frontend and starts a loopback preview on port
4179. For the separate browser EVM acceptance check, compile the scheduled
contract from the parent directory and then run `npm run test:sandbox`. That suite
uses the original app and checks commit, reveal and tally at mobile and desktop
widths with no injected wallet or public network.

The viewport/smoke cases are not full real-wallet acceptance or security tests.
See [manual wallet testing](../../../docs/MANUAL-WALLET-TESTS.md) for the remaining
checks. `test-results/` and `playwright-report/` are generated local output, not
publication evidence or recovery backups.
