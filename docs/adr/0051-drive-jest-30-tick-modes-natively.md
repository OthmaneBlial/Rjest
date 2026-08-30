# ADR 0051: Drive Jest 30 tick modes with native event-loop turns

## Status

Accepted

## Context

Jest 30 exposes `jest.setTimerTickMode()` for three modern fake-timer modes.
`manual` pauses automatic clock movement, `interval` advances fake time on a
native cadence, and `nextAsync` repeatedly crosses a real macrotask boundary
before running the next scheduled fake timer. The last behavior matters for
promise assimilation and for application code that should work with either
real or fake timers.

Rjest already had a teardown-safe native interval driver for the
`advanceTimers` option, but it did not expose runtime mode switching or the
next-timer event-loop driver.

## Decision

The worker owns one generation-counted tick-mode controller:

1. `manual` cancels any configured or runtime automatic driver;
2. `interval` reuses the native interval driver with Jest's 20 ms default;
3. `nextAsync` yields through a native timer turn, advances exactly the next
   fake timer, drains fake microtasks, and repeats; and
4. explicit asynchronous advancement APIs pause `nextAsync` and restore it
   after their promise settles, preventing two drivers from racing the clock;
   and
5. switching modes, reinstalling fake timers, or restoring real timers bumps
   the generation so an older asynchronous driver exits safely.

The API is rejected for legacy fake timers, matching Jest. A differential
fixture covers all three modes, mode switching, cancellation of configured
auto-advance, explicit-advancement pausing, fake clock movement, and the legacy
error boundary.

## Consequences

- Jest 30 suites can use timer-independent async waiting without rewriting
  their tests for Rjest.
- Only one automatic driver owns a fake clock at a time.
- Background next-async failures are retained as file errors rather than
  becoming silent unhandled rejections.
- The worker still restores native timers and stops every driver before custom
  environment teardown.
