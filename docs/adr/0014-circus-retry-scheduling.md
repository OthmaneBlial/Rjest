# ADR 0014: Model Circus retries in the suite scheduler

- Status: accepted
- Date: 2026-08-29

## Context

Jest retries are runner semantics rather than a loop around a test callback.
Default per-test retries are deferred until sibling tests finish, immediate
retries run before the next sibling, and each invocation reruns mock lifecycle
configuration and `beforeEach`/`afterEach`. Jest 30 also supports retrying an
entire describe lifecycle, including its all-hooks and passing descendants.
Discarded attempts must not retain snapshot counters, data, or summary counts.

## Decision

Keep retry configuration in each file worker, but execute it in the suite
scheduler. Per-test failures retain their declaration-order result slot and are
replaced by the final invocation. Whole-describe retries wrap a complete suite
attempt, disable per-test retry loops inside that transaction, and compose when
nested describes define their own retry policy.

Journal snapshot changes by test identity: counters, checked keys, serialized
data, summary counts, and writes are restored before a retry. Retain successful
attempt journals so an enclosing whole-describe retry can roll them back too.
Treat inherited setup failures, process errors, and afterAll-only errors as
non-retryable. Worker protocol v14 adds invocation counts and retry reasons to
each test result.

## Consequences

- Hook order and deferred/immediate scheduling follow Jest Circus rather than a
  callback-only retry approximation.
- JSON and terminal reports expose successful flaky tests and their discarded
  failures when `logErrorsBeforeRetry` is enabled.
- Snapshot summaries contain only the retained attempt while unrelated tests
  keep their own state.
- Nested whole-describe retries can multiply invocations exactly as Jest does.
