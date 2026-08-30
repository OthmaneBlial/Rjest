# ADR 0065: Support temporary mock implementations

## Status

Accepted.

## Context

Jest mock functions expose `withImplementation` to replace their default
behavior only while a callback runs. The temporary scope must hide queued
`mockImplementationOnce` and `mockReturnValueOnce` entries, then restore the
original queue. Asynchronous callbacks keep the temporary implementation until
their promise fulfills, and nested scopes restore the surrounding layer.

Rjest mock functions did not expose this API, so suites using the modern Jest
mock contract failed before their callback ran.

## Decision

Each Rjest mock keeps its once-implementation queue as replaceable scope state.
`withImplementation` saves the default implementation and queue, installs the
temporary implementation with an empty queue, and restores both after a
synchronous callback returns or an asynchronous callback fulfills. Temporary
scopes can nest naturally.

Jest does not restore this state when the callback throws or its promise
rejects. Rjest preserves that observable behavior rather than applying a
`finally` cleanup that would diverge from the oracle.

## Consequences

- Sync, async, and nested temporary implementations match Jest.
- Outside once-values do not bleed into a temporary scope and remain queued.
- Once-values created inside a scope do not leak after successful restoration.
- Failed callbacks leave the temporary implementation active like Jest.
- A permanent five-test differential fixture covers the contracts.
- The Mocks category grows from 14 to 15 scenarios, and the complete
  compatibility matrix grows from 223 to 224 scenarios.
