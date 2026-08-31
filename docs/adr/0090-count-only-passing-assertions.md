# ADR 0090: Count only passing assertions

## Status

Accepted.

## Context

Jest exposes both `assertionCalls` and `numPassingAsserts`. A matcher invocation
increments the first counter, while only a successful outcome increments the
second. Rjest left the public passing counter at zero during execution and then
reported every assertion call as passing, including caught matcher failures.

## Decision

Maintain a passing-assertion counter on the active test independently from the
total invocation count. Increment it after successful built-in, negated,
custom, asynchronous, and snapshot matcher outcomes. Project it through
`expect.getState()` and use it for the worker's final `numPassingAsserts`
result.

Preserve a differential fixture that observes the counter between assertions,
catches a failed matcher, and exercises an asynchronous custom matcher.

## Consequences

- Expect state now distinguishes attempted assertions from successful ones.
- Reporter and JSON consumers receive Jest-compatible passing-assert counts.
- Exact assertion-count enforcement continues to use all matcher invocations.
- The Expect category grows from 16 to 17 scenarios, and the complete
  compatibility matrix grows from 274 to 275 scenarios.
