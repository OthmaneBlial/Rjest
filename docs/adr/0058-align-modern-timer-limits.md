# ADR 0058: Align modern timer limits

## Status

Accepted.

## Context

Jest delegates modern fake-timer scheduling to Sinon. Its `timerLimit` protects
unbounded timer drains such as `runAllTimers`, but it does not impose the same
callback cap on a finite `advanceTimersByTime` interval. Sinon also counts its
microtask job loop differently from its timer drain: with a limit of three, a
recursive `nextTick` callback runs five times before the infinite-loop error.

Rjest used one generic loop counter for every path. It stopped recursive ticks
too early, capped finite time advances after three callbacks, and omitted the
final exclamation mark from Sinon's public diagnostic. These differences could
either fail valid bounded work or change code that asserts Jest's guardrail.

## Decision

Modern all-timer drains keep the configured or runtime-overridden recursion
limit and now emit Sinon's exact error. Modern microtask draining mirrors the
observed Sinon job-loop boundary, including its callback count and diagnostic.

Finite synchronous and asynchronous time advances no longer apply the global
drain counter. They still run fake microtasks at every timer boundary, so a
genuinely recursive microtask queue remains guarded. Legacy timer paths retain
their separate fixed loop limit and legacy error wording.

## Consequences

- Configured and runtime `timerLimit` values stop recursive all-timer drains at
  the same callback count as Jest.
- Recursive `nextTick` queues preserve Sinon's distinct job-loop behavior.
- Large but finite time advances are not rejected solely for exceeding the
  drain limit.
- Sync and async timer APIs share the same measured contract.
- A permanent six-test differential fixture records messages and callback
  counts against official Jest.
- The Fake timers category grows from 13 to 14 scenarios, and the complete
  compatibility matrix grows from 216 to 217 scenarios.
