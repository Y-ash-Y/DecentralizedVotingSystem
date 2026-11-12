# Frontend benchmark utility

Run `npm run benchmark:events` from the frontend directory. This invokes
[benchmark-events.mjs](benchmark-events.mjs) with exposed garbage collection for
the controlled event-reading benchmark.

Interpret it with the [benchmark notes](../../../docs/BENCHMARKS.md). It measures
a declared local fixture, not guaranteed RPC latency, live throughput or behavior
under every chain reorganization. It is separate from contract gas benchmarks
in the parent [scripts folder](../../scripts/README.md).
