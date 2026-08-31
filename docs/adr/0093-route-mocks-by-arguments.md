# ADR 0093: Route mock implementations by arguments

## Status

Accepted.

## Context

Jest 30 mock functions expose `whenCalledWith(...)` for selecting an
implementation from the call arguments. Rjest mock functions did not expose
that API or the related `getMockImplementation()` inspector, so unchanged tests
using argument-specific mocks failed before executing their assertions.

The contract extends beyond literal matching. Jest orders parent and branch
one-shot implementations, resolves overlapping branches, preserves fallback
implementations, and integrates the selected branch with mock state,
constructors, spies, resets, promise helpers, and `withImplementation`.

## Decision

Store argument-specific registrations with each mock function and select them
using Jest equality. Drain the earliest matching branch with a queued one-shot
implementation first; otherwise use the most recently registered persistent
branch, followed by the parent fallback. Keep branch state independent while
recording every invocation on the parent.

Expose `getMockImplementation()` as the user implementation rather than the
internal routing mechanism. Preserve branch registrations across `mockClear`,
clear and reset referenced branches during `mockReset`, and suspend routing
while a temporary implementation has precedence.

## Consequences

- Existing Jest 30 suites can use argument-routed mock behavior unchanged.
- Asymmetric values, nested objects, maps, sets, and trailing `undefined` share
  the runner's Jest-compatible equality semantics.
- A permanent 11-test differential fixture covers routing order and lifecycle
  behavior against official Jest.
- The Mocks category grows from 16 to 17 scenarios, and the complete
  compatibility matrix grows from 277 to 278 scenarios.
