# ADR 0069: Expose expect test identity context

## Status

Accepted.

## Context

Jest stores the currently executing circus test in async-local state and
exposes two callbacks through `expect.getState()`:
`currentConcurrentTestName()` returns the active test's full name, and
`currentTestIdentity()` returns its stable test-entry object. Despite the first
callback's historical name, Jest exposes the active name for sequential tests
too. Both callbacks return `undefined` outside a test and remain stable through
per-test hooks, overlapping concurrent callbacks, and retries.

Rjest already exposed common mutable matcher state, but these callbacks were
absent. Ecosystem matchers and snapshot integrations that use Jest's identity
contract could not attach state to the right test.

## Decision

Expose both callbacks on the worker's shared expect state. Resolve their values
from the worker's async-local test context instead of a process-global mutable
slot. Return the test node itself for identity and its computed full name for
the name callback.

## Consequences

- Custom matchers can associate state with a stable test entry.
- Concurrent callbacks observe their own identity before and after awaits.
- Sequential `beforeEach`, test bodies, and `afterEach` share one identity.
- `beforeAll`, `afterAll`, and code outside test execution receive `undefined`.
- A permanent three-test differential fixture covers concurrent isolation,
  distinct identities, sequential hooks, full names, and outside-test state.
- The Expect category grows from 12 to 13 scenarios, and the complete
  compatibility matrix grows from 227 to 228 scenarios.
