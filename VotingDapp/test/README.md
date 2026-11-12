# Contract and local-EVM tests

From the parent Hardhat package:

```sh
npm test
npm run test:coverage
npm test
```

The final ordinary run restores and verifies non-instrumented artifacts after
coverage. Tests use a simulated chain; no personal wallet, API key or testnet
funds are required.

Contract `npm test` also applies the pinned dependency mitigation and runs
39 [tooling regressions](../test-tooling/README.md) before these Mocha tests.
They are additional checks, not replacements for protocol assertions.

| Files | Coverage |
|---|---|
| `Voting.js`, `VotingV2.js` | Authorization, election phases, ballots, commitment/reveal and tally rules |
| `VotingModel.js` | Independent tally/model comparisons |
| `FrontendIntegration.js` | Browser helper behavior against a real local EVM |
| `VotingLocalTest.js` | Local-only fixture restrictions |
| `LocalDemo.js`, `LocalDemoAutoMining.js` | Session handling and idle-wallet phase progression |
| `DeploymentNetwork.js` | Deployment/network boundaries |

These tests complement [frontend unit/UI/browser checks](../voting-frontend/README.md#checks).
Passing cases and high coverage do not establish election-system security or
replace an independent audit. Historical observed checks are in
[verification](../../docs/VERIFICATION.md).
