# ADR 0063: Enforce animation-frame clear contracts

## Status

Accepted.

## Context

Modern Jest delegates fake timers to Sinon, which treats animation frames as a
distinct timer family. `cancelAnimationFrame` must reject timeout handles,
`clearTimeout` must reject animation-frame handles, and both failures identify
the creation and clearing APIs. An invalid clear must not remove either timer.

Rjest deleted any handle passed to `cancelAnimationFrame`, used an internal
`setAnimationFrame` name in the opposite mismatch, and did not forward native
frame IDs created before fake timers were installed. Its animation callback
validation also differed from the other modern timer APIs.

## Decision

Modern animation scheduling uses the common Sinon-compatible callback
validator. Animation cancellation now flows through the typed fake-timer clear
path, with `requestAnimationFrame` and `cancelAnimationFrame` mapped to their
public API names. Handles below the fake-timer range are forwarded to the
captured native JSDOM cancellation function.

## Consequences

- Missing and non-function frame callbacks match Jest's error class and message.
- Timeout/frame cross-clears throw without removing either pending timer.
- Native frames can be cancelled after fake timers are installed.
- Correct frame cancellation and numeric JSDOM handles remain unchanged.
- A permanent four-test differential fixture covers the contracts.
- The Fake timers category grows from 18 to 19 scenarios, and the complete
  compatibility matrix grows from 221 to 222 scenarios.
