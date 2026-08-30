# ADR 0070: Enforce expect call arity

## Status

Accepted.

## Context

Jest permits `expect()` with no received value and the ordinary
`expect(received)` form, but rejects every call with more than one argument
using `Expect takes at most one argument.`. Rjest's JavaScript function accepted
one formal parameter and silently ignored every additional value.

Silent acceptance can hide a malformed assertion or a migration mistake that
official Jest rejects before a matcher is selected.

## Decision

Collect trailing arguments in the global `expect` function and throw Jest's
diagnostic whenever at least one is present. Preserve zero-argument behavior by
constructing an expectation whose received value is `undefined`.

## Consequences

- Accidental multi-argument calls fail at the same boundary as Jest.
- Zero-argument and one-argument expectations remain valid.
- A permanent two-test differential fixture covers both accepted forms and two
  distinct extra-argument calls.
- The Expect category grows from 13 to 14 scenarios, and the complete
  compatibility matrix grows from 228 to 229 scenarios.
