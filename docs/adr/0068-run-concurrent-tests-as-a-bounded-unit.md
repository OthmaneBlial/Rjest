# ADR 0068: Run concurrent tests as a bounded unit

## Status

Accepted.

## Context

Jest does more than expose the `test.concurrent` declaration chain. Within a
`describe`, it collects every directly declared concurrent test into one unit
at the position of the first concurrent declaration, runs that unit with the
global `maxConcurrency` limit, and resumes sequential children only after the
unit settles. Jest also omits `beforeEach` and `afterEach` hooks for concurrent
tests.

Rjest recorded the `concurrent` flag but executed every child sequentially and
ran per-test hooks. This hid real races, changed ordering around interleaved
sequential tests, and made `maxConcurrency` ineffective inside a test file.

## Decision

Group direct concurrent children exactly once per suite and execute them with a
small bounded promise scheduler. Immediate retries remain inside the same
concurrency slot; deferred retries retain their existing post-suite order.
Emit the Jest circus `concurrent_tests_start` and `concurrent_tests_end` events
around the unit, and skip per-test hooks for concurrent nodes.

Use `AsyncLocalStorage` to associate assertions, snapshot names, custom matcher
state, and environment events with the correct test while callbacks overlap.
This keeps test identity isolated without cloning the shared JavaScript test
environment.

## Consequences

- `test.concurrent`, `.each`, `.only`, and `.failing` declarations now execute
  concurrently rather than only carrying metadata.
- `maxConcurrency` bounds active tests within a worker.
- Sequential children wait for the suite's complete concurrent unit, matching
  Jest's regrouping order.
- `beforeEach` and `afterEach` continue to apply to sequential tests but not to
  concurrent tests.
- Concurrent snapshot assertions retain the correct test name and counter.
- A permanent six-test differential fixture covers overlap, grouping,
  configured concurrency, hook behavior, and three concurrent snapshots.
- The Core API category grows from 14 to 15 scenarios, and the complete
  compatibility matrix grows from 226 to 227 scenarios.
