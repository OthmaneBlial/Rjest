# ADR 0056: Support modern temporal fake timers

## Status

Accepted.

## Context

Modern Jest fake timers accept more than numeric timestamps and durations.
Initial time and `setSystemTime` can receive Temporal-shaped objects exposing
`epochMilliseconds`, while synchronous and asynchronous advance methods accept
duration-shaped objects exposing `total({unit: 'millisecond'})`.

Rjest previously converted these objects through `Date` or `Number`, producing
`NaN` or a zero-length advance. Its fake `Date` was a JavaScript class, so the
standard callable form `Date()` threw even though native Date and Jest's fake
Date support calls with and without `new`. A missing `setSystemTime` argument
also selected real time instead of the Unix epoch, and negative modern advances
were silently converted to zero.

## Decision

Rjest normalizes fake-clock epochs using Jest's accepted runtime shapes:
numbers are used directly, Date-like values use `getTime()`, and Temporal-like
values use numeric `epochMilliseconds`. A missing `setSystemTime` value selects
epoch zero, while an omitted or nullish initial `now` retains real current time.

Modern advance methods accept numbers or objects with `total()`, call that
method with millisecond units, and reject negative results. Legacy duration
behavior remains unchanged. The fake Date constructor is exposed through a
callable proxy around a Date subclass, preserving static Date methods,
`instanceof`, construction, and the string-returning `Date()` form. JSDOM's
window receives and restores the same fake constructor.

## Consequences

- Temporal Instant/ZonedDateTime-shaped epochs work without importing Temporal.
- Temporal Duration-shaped values work in sync and async timer advances.
- `Date()` remains compatible with the JavaScript built-in while time is fake.
- Modern clocks reject backwards advances instead of mutating time silently.
- A permanent eight-test differential fixture covers modern and legacy modes.
- The versioned Fake timers category grows from 11 to 12 scenarios, and the
  complete compatibility matrix grows from 214 to 215 scenarios.
