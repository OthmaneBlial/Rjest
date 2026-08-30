# ADR 0060: Forward native timer clears

## Status

Accepted.

## Context

Modern Jest installs Sinon fake timers with `shouldClearNativeTimers` enabled.
A native timeout, interval, or immediate created before `jest.useFakeTimers()`
can therefore still be cleared through the currently faked global API. This is
important for modules that initialize timers before a test takes control of the
clock.

Rjest treated every clear request as a fake-timer map deletion. Native handles
were left running, successful fake clears returned the map's boolean result,
and timeout/immediate type mismatches were silently accepted.

## Decision

Modern fake timer identifiers use Sinon's high identifier range. Clear requests
below that range, or non-numeric Node immediate handles, are forwarded to the
captured native clear function. Numeric JSDOM handles are routed to the captured
window implementation, while Node handles remain on the Node timer APIs.

Fake timeout and interval handles remain interchangeable for clearing, matching
Node and Sinon. Immediate handles must be cleared with `clearImmediate`; an
incompatible clear throws Sinon's timer-construction diagnostic. Every
successful or ignored clear returns `undefined`.

## Consequences

- Modules can clean up real timers after installing modern fake timers.
- Node timeout, interval, and immediate handles are covered independently.
- JSDOM native timeout and interval routing has dedicated coverage.
- Cross-clearing timeout/interval handles remains compatible with Node.
- Immediate type mismatches fail early with Jest's observable error.
- A permanent eight-test differential fixture preserves these contracts.
- The Fake timers category grows from 15 to 16 scenarios, and the complete
  compatibility matrix grows from 218 to 219 scenarios.
