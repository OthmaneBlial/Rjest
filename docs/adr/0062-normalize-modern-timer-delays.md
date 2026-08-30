# ADR 0062: Normalize modern timer delays

## Status

Accepted.

## Context

Sinon normalizes modern fake-timer delays at a Web IDL boundary. Values above
the signed 32-bit maximum become one millisecond, non-number inputs use
`parseInt`, and non-finite values become zero. It also owns the callback
validation diagnostics exposed through Jest.

Rjest used `Number()` plus a non-negative floor. A timeout such as `10ms` fired
immediately, a delay above `2^31 - 1` remained billions of milliseconds away,
and callback failures used Rjest-specific messages.

## Decision

Modern scheduling now parses non-number delays with base-10 `parseInt`, maps
non-finite values to zero, clamps values above `2^31 - 1` to one, and otherwise
uses the non-negative integer portion. Legacy timer conversion remains
unchanged.

Missing callbacks throw `Callback must be provided to timer calls`.
Non-functions throw Sinon's `[ERR_INVALID_CALLBACK]` diagnostic including the
received value and JavaScript type. The same validation serves timeout,
interval, and immediate scheduling.

## Consequences

- Extremely large timeouts and intervals no longer leave fake suites hung.
- The exact signed 32-bit maximum remains a valid long deadline.
- String-like delays match Jest/Sinon instead of `Number()` coercion.
- Timer callback failures expose the compatible message and error class.
- A permanent six-test differential fixture covers the contracts.
- The Fake timers category grows from 17 to 18 scenarios, and the complete
  compatibility matrix grows from 220 to 221 scenarios.
