# Service tests

From the frontend directory, run `npm test`. These Node tests cover network and
deployment checks, commitment/recovery handling, transaction outcomes, errors,
event reads and review regressions without a real wallet or public chain.

`npm run test:coverage` measures the selected `src/lib/*.js` service files. It is
not whole-application or smart-contract coverage.

Use [UI tests](../test-ui/README.md) for component behavior, [browser checks](../test-browser/README.md)
for built-page behavior, and the parent [contract tests](../../test/README.md) for
local-EVM integration. No one layer replaces the others.
