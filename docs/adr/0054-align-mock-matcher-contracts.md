# ADR 0054: Align mock matcher contracts

## Status

Accepted.

## Context

Rjest's call and return matchers compared ordinary `jest.fn` records, but some
invalid invocations were treated as failed assertions instead of matcher usage
errors. Count matchers accepted values such as negative numbers, fractions,
infinities, and strings. Matchers that take no expected argument silently
ignored one. The call family also rejected Jasmine-compatible spy records that
official Jest still recognizes.

These behaviors matter to suites that test their own assertions, share helpers
between Jest mock functions and legacy spies, or rely on invalid matcher usage
being distinguishable from a legitimate comparison failure.

## Decision

Rjest now applies shared validation for matchers with no expected value, mock
count arguments, mock-only receivers, and mock-or-spy receivers. Count matchers
require non-negative safe integers. Nth call and return matchers retain Jest's
positive safe-integer rule.

Call matchers recognize the same observable Jasmine spy shape as Jest: a
`calls` object exposing `all()` and `count()`. Call records are normalized to
argument arrays before equality checks. Return matchers remain restricted to
mock functions because Jasmine spy records do not expose Jest mock results.

## Consequences

- Invalid matcher usage throws at the same boundary as official Jest for the
  covered call, return, count, and zero-argument matchers.
- Existing Jasmine-style call records work with called, count, last, nth, and
  argument matchers.
- Rjest's legacy matcher aliases inherit the same validation where present.
- A permanent eight-test differential fixture records the official behavior.
- The versioned Expect category grows from 10 to 11 scenarios, and the complete
  compatibility matrix grows from 212 to 213 scenarios.
