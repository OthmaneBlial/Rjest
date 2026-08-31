# ADR 0095: Accept the Jest Circus runner CLI override

## Status

Accepted.

## Context

After accepting explicit Circus selection in Jest configuration, the equivalent
command-line invocation still failed before discovery because Rjest did not
recognize `--testRunner`. Jest accepts
`--testRunner=jest-circus/runner` and executes the same Circus lifecycle.

Arbitrary custom runner modules remain outside Rjest's execution model, so a
free-form CLI value would make an unsupported replacement look accepted.

## Decision

Add Jest's camel-case `--testRunner` option and a kebab-case alias. Restrict the
accepted CLI value to `jest-circus/runner`, then apply it recursively to every
project configuration before execution.

Reuse the explicit-Circus fixture under a default inline configuration so the
new differential scenario proves that only the CLI override selects the runner.
Preserve a Rust parser and multi-project propagation test, including rejection
of a custom runner path.

## Consequences

- Existing scripts that explicitly select Circus can replace the command name
  without removing the option.
- CLI and configuration now share the same honest custom-runner boundary.
- The Rust suite grows from 131 to 132 tests.
- The CLI category grows from 75 to 76 scenarios, and the complete
  compatibility matrix grows from 279 to 280 scenarios.
