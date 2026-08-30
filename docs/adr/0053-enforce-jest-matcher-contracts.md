# ADR 0053: Enforce Jest core matcher contracts

## Status

Accepted.

## Context

Rjest exposed Jest's core matcher names, but several implementations accepted
values that official Jest rejects. JavaScript coercion made ordering matchers
compare strings, string containment converted non-string values, and invalid
property paths or object operands returned assertion failures instead of matcher
usage errors. `toBeCloseTo` also rejected matching infinities, while `toMatch`
mutated the `lastIndex` of a global regular expression supplied by a test.

These differences affect existing suites that test validation behavior, wrap
matchers in `toThrow`, reuse regular expressions, or compare numeric values
across `number` and `bigint` types.

## Decision

Core matchers now validate operands at the same observable boundary as Jest.
Ordering accepts only numbers and bigints while retaining mixed numeric-type
comparisons. Close comparisons require numbers and explicitly match same-sign
infinities. Length, containment, instance, object, and property matchers reject
invalid inputs with matcher errors instead of silently returning false.

`toMatch` requires a string receiver and a string or regular-expression-like
expected value. It compiles a fresh `RegExp` for matching so the caller's regex
state is not changed.

## Consequences

- Invalid matcher usage is distinguishable from an ordinary failed assertion.
- Numeric and property matching no longer relies on accidental JavaScript
  coercion.
- Reusing a global regular expression after `toMatch` observes Jest's unchanged
  `lastIndex` behavior.
- A permanent nine-test differential fixture records the official behavior.
- The versioned Expect category grows from 9 to 10 scenarios, and the complete
  compatibility matrix grows from 211 to 212 scenarios.
