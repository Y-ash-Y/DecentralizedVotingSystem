# Wallet and chain services

| Module | Responsibility |
|---|---|
| [network.js](network.js) | Explicit chain/RPC configuration and network validation |
| [deployment.js](deployment.js) | Address, protocol, runtime code and local-fixture verification |
| [commitments.js](commitments.js) | Secrets, protocol-specific commitment hashes and recovery data |
| [transactions.js](transactions.js) | Submission/receipt handling, replacements and duplicate protection |
| [chainData.js](chainData.js) | Bounded event reads, chain changes and consistent snapshots |
| [results.js](results.js) | Tally, tie and zero-turnout presentation rules |
| [errors.js](errors.js) | Actionable failure messages |

Commit–reveal recovery must save the necessary secret before requesting a
signature. A submitted transaction is not a successful ballot until its receipt
and outcome are checked. Equivalent fee replacement differs from cancellation
or replacement with a different action.

These modules are tested with [service fixtures](../../test/README.md) and
[real local-EVM integration](../../../test/README.md). They are safety boundaries,
not a guarantee against a compromised wallet, RPC or browser. Read the
[security review](../../../../docs/SECURITY-REVIEW.md) for limits.
