# ADR 0052: Match Jest asymmetric factory semantics

## Status

Accepted.

## Context

Jest 30 exposes `expect.arrayOf` and `expect.closeTo` alongside the older
asymmetric factories. These values participate in ordinary equality, nested
object matching, mock argument matching, snapshot property matching, and
custom equality testers. Implementing only the factory names would miss
observable behavior such as input validation, inverse matching, numeric
precision, infinity handling, and equality-tester argument order.

The audit also found older differences. Jest treats an empty
`arrayContaining` sample as a match even when the received value is not an
array, compiles string input to `stringMatching` as a regular expression, and
gives `expect.any` special behavior for built-in constructors.

## Decision

Rjest implements the Jest 30 positive and negative `arrayOf` and `closeTo`
factories in the shared asymmetric-matcher layer. Collection factories compare
the expected sample before the received value so custom equality testers see
Jest's argument order. Numeric matching uses Jest's strict half-unit precision
boundary and explicit same-sign infinity cases.

The existing asymmetric factories now share validation and inversion helpers.
They retain Jest's constructor cases, empty-array rule, matcher-specific error
names, and string-to-RegExp compilation.

## Consequences

- Nested `arrayOf`, `closeTo`, object, string, and custom matchers compose through
  the same equality path.
- Invalid samples fail at the same construction or match boundary as Jest for
  the covered factories.
- A permanent differential fixture records the official Jest behavior,
  including custom equality testers and the surprising empty-array rule.
- The versioned Expect category grows from 8 to 9 scenarios, and the complete
  compatibility matrix grows from 210 to 211 scenarios.
