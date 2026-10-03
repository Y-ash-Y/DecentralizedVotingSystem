# Reproducible measurements

## Current contract — 2 October 2026

Run `npm run benchmark:current` from VotingDapp. The script refuses public
networks, starts a disposable EVM, validates the final tally and prints actual
receipt gas usage. It advances local time; no live funds or hour-long wait is needed.

| Parameter | Value |
| --- | --- |
| Node / Hardhat | 22.22.2 / 3.18.0 |
| Solidity / EVM target | 0.8.20+commit.a1b79de6 / Paris |
| Optimizer | Disabled; runs setting 200 is inactive |
| Runtime | 19,165 bytes |
| Runtime keccak256 | `0x369b26f5d2a52fd0942d22ed9d0aca218e38d2ada72e8dbcc0959da628ac138f` |

This identifies the ordinary local build, not any public deployment. Coverage
instrumentation changes bytecode: run ordinary tests after coverage and before
benchmarking. Existing deployed manifests must not be overwritten with this hash.

| Operation | Gas used |
| --- | ---: |
| Deploy | 4,188,051 |
| Create commit–reveal election | 165,368 |
| Batch-add Alice, Bob, Simran, Raj | 357,471 |
| Authorize one local test signer | 77,771 |
| Seal setup | 39,289 |
| Commit | 63,661 |
| Reveal | 69,782 |

Phase transitions need no administrator transaction. Creation gas can vary with
timestamp/calldata bytes; these are receipt values from this fixture, not constants.

## Controlled batching comparison

For each row, deploy two fresh contracts and use identical deterministic fresh
addresses. One receives a batch; the other receives individual authorizations.
Sum actual individual receipts: the first voter-count write differs from later
writes, so multiplying one receipt by the number of addresses is incorrect.

| Addresses | Batch gas | Sum of individual gas | Savings |
| ---: | ---: | ---: | ---: |
| 1 | 78,462 | 77,543 | -1.19% |
| 5 | 181,874 | 319,315 | 43.04% |
| 10 | 311,139 | 621,530 | 49.94% |
| 50 | 1,345,259 | 3,039,250 | 55.74% |

Savings = 100 × (individual total − batch total) / individual total.
For ten addresses: 100 × (621530 − 311139) / 621530 ≈ 49.94%.

A one-entry batch costs more because array/loop overhead outweighs savings.
Batching amortizes transaction overhead; it does not make storage writes free.
Fifty is the per-batch limit, not a total election-voter cap.

Gas is an execution-unit measurement, not latency or throughput. A hypothetical
10 gwei price gives ETH cost = gasUsed × 10 × 10^-9; actual prices vary.
RPC reads create no paid user transaction but still consume provider resources.

The earlier deployment's compatibility benchmark remains reproducible through
`npm run benchmark`; its different validation/storage must not be presented as
an isolated optimization comparison with the current contract.

## Synthetic event-processing workload — historical 28 September measurement

Reproduce with `npm run benchmark:events` in the frontend. Seven cold runs per
size used Node 22.22.2 on macOS arm64, one generated event per block and
10,000-block pages. Provider responses and parsed event objects are simulated
in memory. Assertions check counts, zero extra log requests for cached reads
and one suffix request after invalidation. Garbage collection is requested.

| Events | Median cold ms | Observed p95 ms | Largest heap delta MiB | Cold log requests |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.19 | 0.61 | 0.53 | 1 |
| 10,000 | 1.58 | 4.32 | 4.39 | 1 |
| 100,000 | 14.84 | 21.18 | 25.26 | 10 |
| 250,000 | 36.91 | 45.06 | 71.80 | 25 |

With seven samples, nearest-rank p95 is merely the largest observed sample,
not a stable production percentile. Heap delta is not peak memory. This excludes
network latency, JSON transfer, actual ABI decoding and React rendering. These
historical timings were not remeasured in the final cleanup pass.

## Limits

Neither fixture establishes concurrent-voter capacity, real-RPC performance,
phone-memory limits or mainnet throughput. The event budget fails closed beyond
250,000 events, but a hostile provider may allocate an oversized response before
that check. Results are deterministic engineering measurements, not a user study,
confidence interval or load certification. Rerun after relevant source/tool changes.
