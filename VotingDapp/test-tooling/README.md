# Tooling regression tests

Run `npm run deps:patch` then `npm run test:tooling` from the parent package.
Contract `npm test` includes these checks before its existing Mocha suite.

These Node tests validate the [pinned Zod mitigation](../patches/README.md),
not the Solidity voting protocol. They use owned temporary fixtures and a
memory-limited child process; no wallet, RPC endpoint, `.env` or public chain is
needed. Unbounded containers deliberately remain a documented limitation.
