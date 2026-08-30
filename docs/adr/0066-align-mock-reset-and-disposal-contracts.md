# ADR 0066: Align mock reset and disposal contracts

## Status

Accepted.

## Context

Jest creates `mock.lastCall` only after the first invocation. `mockClear`
removes call state but preserves the configured name, implementation, and once
queue; `mockReset` additionally removes implementations and restores the
default `jest.fn()` name. `mockRestore` applies reset, restores spies, and
returns `undefined`. Modern runtimes also expose it as `mock[Symbol.dispose]`.

Rjest initialized `lastCall` to `undefined`, retained custom names after reset,
returned the mock from restore, and did not expose the disposal symbol.

## Decision

Fresh mock state omits `lastCall` until invocation. Reset restores the default
mock name in addition to clearing state and implementations. Restore returns
the underlying restoration callback's result, or `undefined` for standalone
mocks. When `Symbol.dispose` exists, every created mock exposes the exact
`mockRestore` function at that symbol.

## Consequences

- Property-presence checks on fresh and cleared mock state match Jest.
- Clear and reset retain their distinct name, implementation, and queue rules.
- Standalone and spy restore calls return `undefined` and reset names.
- Explicit resource management can dispose mocks and spies through the Jest API.
- A permanent five-test differential fixture covers the contracts.
- The Mocks category grows from 15 to 16 scenarios, and the complete
  compatibility matrix grows from 224 to 225 scenarios.
