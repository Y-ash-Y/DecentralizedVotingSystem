# Local-only contract fixture

[VotingLocalTest.sol](VotingLocalTest.sol) supports short local-demo timing and
exposes an explicit fixture marker. Frontend verification checks that marker
before enabling fast local behavior.

Use it only through the isolated local-demo workflow on chain 31337. It is not
the production/testnet deployment target and must not be substituted merely
because a contract happens to have a compatible function name.

The [fixture tests](../../test/README.md) and frontend/local-EVM integration
checks exercise this boundary. The root [wallet walkthrough](../../../docs/MANUAL-WALLET-TESTS.md)
describes manual acceptance, scheduling and recovery checks.
