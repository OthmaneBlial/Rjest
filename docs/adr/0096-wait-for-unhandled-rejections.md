# ADR 0096: Match Jest's unhandled-rejection grace period

## Status

Accepted.

## Context

Jest's `waitForUnhandledRejections` option controls whether Circus waits one
event-loop turn before deciding that a rejected promise is still unhandled.
Rjest previously rejected the configuration field and recorded every
`unhandledRejection` immediately as a file error. This could fail a test that
attached its rejection handler during the next turn and could attribute hook
errors to the wrong scope.

## Decision

Normalize the option with Jest's default value of `false`, propagate it through
worker protocol version 28, and track pending errors by promise identity. When
enabled, wait one native timer turn at test-function and hook completion
boundaries. A matching `rejectionHandled` event removes the pending error.

Attribute test and `*Each` hook rejections to the active test, `beforeAll`
rejections to descendant tests, `afterAll` rejections to the file, and
out-of-lifecycle rejections to the file-level error collection.

## Consequences

- Late-handled promise rejections now match the covered Jest behavior.
- Permanently unhandled rejections still fail at the correct lifecycle scope.
- The Configuration category grows from 52 to 58 scenarios.
- The Rust suite grows from 132 to 133 tests, and the complete differential
  matrix grows from 280 to 286 scenarios.
