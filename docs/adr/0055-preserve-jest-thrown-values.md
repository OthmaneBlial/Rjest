# ADR 0055: Preserve Jest thrown-value semantics

## Status

Accepted.

## Context

The JavaScript value `undefined` can be thrown explicitly. Rjest previously used
`undefined` as the sentinel for a function that did not throw, so
`expect(() => { throw undefined; }).toThrow()` failed even though official Jest
passes it. The same implementation reduced thrown values to a message too
early, losing Jest's distinctions for non-Error objects, nested error causes,
custom error constructors, and asymmetric matchers.

Jest also accepts regular-expression-like objects with a `test()` method and
rejects unsupported primitive expectations as matcher usage errors.

## Decision

Rjest now represents a caught value with an explicit record containing the
original value, its normalized message, whether it supplied a string message,
and whether it has the observable Error shape. `null` remains the internal
sentinel for a function that returned without throwing, so every JavaScript
value, including `undefined`, remains a valid thrown value.

`toThrow` dispatches expectations by the same observable categories as Jest:
class, string, RegExp-like object, asymmetric matcher, and error-like object.
Object expectations compare messages and recursively serialized causes. A
custom expected Error instance additionally requires the thrown value to use
the same constructor, while a base `Error` expectation remains message-based.

## Consequences

- Explicitly throwing `undefined` is no longer confused with returning.
- Non-Error values retain Jest's `String(value)` message behavior.
- Nested causes and custom Error classes participate in object expectation
  matching.
- RegExp-like and asymmetric expectations receive the same message or original
  value that official Jest exposes.
- A permanent eight-test differential fixture records these boundaries.
- The versioned Expect category grows from 11 to 12 scenarios, and the complete
  compatibility matrix grows from 213 to 214 scenarios.
