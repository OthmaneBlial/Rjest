# ADR 0011: Reset mock state before user test setup

- Status: accepted
- Date: 2026-08-29

## Context

Jest's `resetMocks` configuration invokes `resetAllMocks` before every test,
after optional clearing and before restoration or user `beforeEach` hooks. It
removes mock calls and implementations but does not restore spies or replaced
properties. Mocks created by `setupFilesAfterEnv` are reset before the first
test.

Legacy fake timer APIs are themselves Jest mock functions. Resetting them drops
their scheduling implementations, so Jest reinstalls globally configured legacy
timers immediately afterward. The reinstall retains an already pending setup
timer; it does not silently empty the timer queue.

## Decision

Extend the flattened `MockLifecycleConfig` with `resetMocks`, propagate it in
worker protocol v12, and execute `resetAllMocks` between configured clearing and
restoration. If global legacy fake timers are configured, reinstall their mock
API wrappers using the existing fake-timer state.

Keep calls, implementations, spy restoration, property restoration, and timer
queues as separate state dimensions so each Jest option changes only its
documented surface.

## Consequences

- Setup- and test-created mock functions and spies have empty calls and no custom
  implementations before every test.
- Spies remain installed and replaced property values remain in place unless
  `restoreMocks` is also configured.
- Globally enabled legacy timer functions remain callable Jest mocks after each
  reset.
- Pending legacy timers survive API reinstallation, matching the oracle.
- Config serialization and the embedded worker agree on protocol version 12.
