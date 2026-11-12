# Frontend source

- [main.jsx](main.jsx) mounts the React application.
- [app.jsx](app.jsx) coordinates wallet/account state, administration, voting, recovery and results.
- [contract.js](contract.js) selects the configured protocol ABI and deployment parameters.
- [abiV2.js](abiV2.js) supplies the scheduled election ABI used by runtime verification and transactions.
- [lib/](lib/README.md) separates chain, commitment and transaction logic from the UI.
- [components/](components/README.md) contains shared presentation elements.
- [sandbox/](sandbox/) supplies a browser-only contract runner, local accounts and
  clock controls for the hosted sandbox. It uses the same application screens.
- [style.css](style.css) defines the application styling.

An address alone does not establish that a deployment supports the current UI.
Protocol selection, chain, deployment block and runtime-code verification must
agree with the manifest. Support for manually advanced elections is needed for
existing deployments that use that ABI.

For configuration and local-demo commands use the [frontend guide](../README.md)
and [deployment notes](../../../docs/DEPLOYMENT.md). No private browser setting
can turn a public on-chain ballot into an anonymous vote.
