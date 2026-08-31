# ADR 0092: Expose asymmetric matcher expected types

## Status

Accepted.

## Context

Jest's asymmetric matcher objects expose `getExpectedType()` when they describe
a concrete expected type. Its formatter and diff machinery can use that public
metadata. Rjest matched the values correctly but omitted the method. Custom
asymmetric matchers created through `expect.extend` also differed in their
type and `toAsymmetricMatcher()` representation.

## Decision

Allow asymmetric matcher construction to carry optional expected-type metadata.
Supply Jest's labels for `expect.any`, array, object, string, and numeric
factories. Leave `expect.anything()` without the method because it deliberately
spans types.

Custom matcher factories report `any` and render as `matcher<arguments>` or
`not.matcher<arguments>`. Preserve a differential fixture for built-in,
negated, user-defined constructor, untyped-anything, and custom cases.

## Consequences

- Jest-compatible formatters can query asymmetric matcher types directly.
- Custom asymmetric matcher diagnostics retain their arguments and negation.
- Value-matching behavior is unchanged.
- The Expect category grows from 18 to 19 scenarios, and the complete
  compatibility matrix grows from 276 to 277 scenarios.
