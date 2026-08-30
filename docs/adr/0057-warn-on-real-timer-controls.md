# ADR 0057: Warn on real-timer controls

## Status

Accepted.

## Context

Jest permits timer-control helpers to be called while real timers are active.
Modern fake-timer methods emit a diagnostic and otherwise do nothing; timer
count returns zero, `clearAllTimers` remains silent, and real clock queries stay
available. This matters for shared cleanup helpers that call timer APIs whether
or not a particular test enabled fake timers.

Rjest instead threw a hard "Fake timers are not active" error. That changed a
recoverable Jest diagnostic into a test failure. It also returned the chainable
Jest object from control methods whose public Jest contract returns `undefined`.

## Decision

Rjest now checks the active timer implementation at each public control
boundary. In inactive modern mode it emits Jest's warning guidance, includes a
stack trace, and returns without mutating the real clock. Async controls resolve
to `undefined` after the warning. Timer count warns and returns zero, while
`clearAllTimers`, `jest.now()`, and `jest.getRealSystemTime()` retain their
separate Jest behavior.

Legacy mode keeps its distinct "not mocked" warning and continues to reject APIs
that Jest exposes only for modern timers. Timer control return values now match
the Jest runtime wrapper; `useFakeTimers`, `useRealTimers`, and
`setTimerTickMode` remain chainable where Jest makes them chainable.

## Consequences

- Shared cleanup helpers no longer fail solely because a test used real timers.
- Synchronous and asynchronous timer controls preserve Jest's warning/no-op
  boundary and return values.
- Modern and legacy warning guidance remain distinguishable.
- A permanent six-test differential fixture proves official Jest and Rjest
  behavior before and after fake-timer activation.
- The Fake timers category grows from 12 to 13 scenarios, and the complete
  compatibility matrix grows from 215 to 216 scenarios.
