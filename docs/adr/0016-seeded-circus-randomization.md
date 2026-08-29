# ADR 0016: Reproduce Jest Circus seeded randomization in workers

- Status: accepted
- Date: 2026-08-29

## Context

Jest users rely on a seed reproducing the same test order. Circus creates one
xoroshiro128plus generator per test file, consumes bounded integers through
rejection sampling, and performs a forward Fisher-Yates shuffle when each
describe block starts. A whole-describe retry must reuse the existing shuffled
children rather than consume the generator again.

## Decision

Propagate the coordinator seed and a randomize flag through worker protocol
v16. Implement the same signed 32-bit xoroshiro128plus state transition and
bounded uniform distribution directly in the worker, avoiding a runtime
dependency on the project's installed Jest or `pure-rand` package.

Shuffle each suite's children in place on first entry and mark the suite so
later retry attempts retain the order. Use a single generator across the file,
which makes nested suite traversal consume the stream at the same lifecycle
points as Circus. Enable seed reporting whenever CLI or configuration
randomization is active.

## Consequences

- A fixed seed reproduces Jest's flat and nested execution order.
- Randomized whole-describe retries execute every attempt in the same order.
- Projects can set `randomize` and `showSeed` without Rjest rejecting their
  configuration.
- File-level sharding remains a separate coordinator concern and is tracked by
  an executable known-incompatible probe.
