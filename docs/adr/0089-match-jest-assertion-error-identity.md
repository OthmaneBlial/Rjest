# ADR 0089: Match Jest assertion error identity

## Status

Accepted.

## Context

Jest exports its assertion error constructor as `JestAssertionError`. Instances
are members of that class and of `Error`, their constructor is named
`JestAssertionError`, but their public `name` remains `Error`. Rjest exported an
internal `RjestAssertionError` class and also set that internal name on every
instance. Code that catches and classifies matcher failures could distinguish
the runners.

## Decision

Keep the internal binding used throughout the worker, but define it with a
`JestAssertionError` class expression and let instances inherit `Error`'s public
name. Continue exporting that same constructor from the intercepted `expect`
package.

Preserve a differential fixture for both a built-in matcher failure and an
extended custom matcher failure. It checks `instanceof Error`, `instanceof
JestAssertionError`, the constructor name, and the instance name.

## Consequences

- Libraries can classify caught assertion failures with the same public class
  contract under Jest and Rjest.
- Failure stack headings now use Jest's standard `Error` name.
- The Expect category grows from 15 to 16 scenarios, and the complete
  compatibility matrix grows from 273 to 274 scenarios.
