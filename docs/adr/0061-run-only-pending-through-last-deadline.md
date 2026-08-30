# ADR 0061: Run pending timers through the last deadline

## Status

Accepted.

## Context

Modern Jest implements `runOnlyPendingTimers` with Sinon's `runToLast`. The
operation records the last deadline already present, then advances the fake
clock through that point. Intervals and timers created during callbacks are
therefore executed when they fall before the recorded boundary.

Rjest instead copied the initial timer collection and invoked each record once.
It skipped nested timers inside the window, under-counted intervals, and left
fake microtasks untouched when no timer existed. The async variant had the same
boundary error for promise-scheduled work.

## Decision

Modern pending-timer drains select the final timer from the current queue once
and reuse the normal finite-time advancement engine through its deadline. New
work inside that window is included, while work after the deadline remains
pending. If no timer exists, the fake microtask queue is still drained.

The async operation first crosses a native event-loop turn, matching Sinon's
async entry point, then selects its deadline and advances asynchronously. Legacy
fake timers retain their existing initial-snapshot semantics.

## Consequences

- Nested timeout work inside the original window is no longer skipped.
- Intervals repeat through the original final deadline.
- Timers created beyond that deadline remain pending for a later drain.
- Sync and async no-timer calls flush fake microtasks.
- A permanent six-test differential fixture covers the boundary.
- The Fake timers category grows from 16 to 17 scenarios, and the complete
  compatibility matrix grows from 219 to 220 scenarios.
