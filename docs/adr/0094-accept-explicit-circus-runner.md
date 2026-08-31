# ADR 0094: Accept explicit Jest Circus runner configuration

## Status

Accepted.

## Context

Many existing Jest configurations explicitly set
`testRunner: "jest-circus/runner"`, even though Circus is the modern Jest
default. Rjest already implements the relevant Circus lifecycle, including
`test.failing`, but rejected the configuration field before discovering tests.
Removing a semantically redundant option is still a migration edit.

Custom Jest runner modules can replace the entire execution model and are not
equivalent to Rjest's built-in lifecycle. Accepting every value would therefore
hide unsupported behavior.

## Decision

Parse and serialize `testRunner`. Accept the canonical `jest-circus/runner`
specifier and resolved installed paths ending in
`node_modules/jest-circus/build/runner.js`. Reject other values with the
configured field and value in the error.

Preserve a differential fixture that runs ordinary assertions and
Circus-specific `test.failing` behavior under the unchanged explicit config.
Add a Rust unit test for the canonical, resolved, and rejected-custom cases.

## Consequences

- Projects retaining the common explicit Circus option need no config edit.
- Custom and legacy runners remain an honest compatibility boundary.
- The Rust suite grows from 130 to 131 tests.
- The Configuration category grows from 51 to 52 scenarios, and the complete
  compatibility matrix grows from 278 to 279 scenarios.
