# Simulated interface tests

Run `npm run test:ui` from the frontend directory. Vitest uses jsdom, Testing
Library and a simulated wallet to exercise the component flow in
[App.test.jsx](App.test.jsx).

These checks cover UI state and recovery behavior, not actual MetaMask account
approval or a public RPC. Run the [browser cases](../test-browser/README.md) for
built-page/layout behavior and the [manual wallet cases](../../../docs/MANUAL-WALLET-TESTS.md)
for extension, account switching and user recovery acceptance.

Do not use real keys or saved voter secrets as fixtures. Synthetic wallet
behavior is deliberately separate from deployment credentials.
