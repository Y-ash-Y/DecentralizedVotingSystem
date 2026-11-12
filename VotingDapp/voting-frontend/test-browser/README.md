# Browser smoke checks

From the frontend directory:

```sh
npx playwright install chromium
npm run test:browser
```

[smoke.spec.js](smoke.spec.js) uses an isolated simulated wallet. The Playwright
configuration builds the frontend and starts a loopback preview on port 4179;
it does not reuse a running preview or submit public-network transactions.

The viewport/smoke cases are not full real-wallet acceptance or security tests.
See [manual wallet testing](../../../docs/MANUAL-WALLET-TESTS.md) for the remaining
checks. `test-results/` and `playwright-report/` are generated local output, not
publication evidence or recovery backups.
