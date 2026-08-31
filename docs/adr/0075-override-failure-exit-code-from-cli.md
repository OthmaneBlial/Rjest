# ADR 0075: Override failure exit code from the CLI

## Status

Accepted.

## Context

Jest exposes `testFailureExitCode` through both configuration and the
`--testFailureExitCode` command-line option. The CLI value takes precedence,
which lets CI wrappers select a status without editing a repository's shared
configuration.

Rjest already honored the configured value, but Clap rejected the equivalent
CLI option before configuration or test execution. A repository relying on
that override could therefore not replace its Jest command unchanged.

## Decision

Parse Jest's camel-case `--testFailureExitCode=<number>` option, with a
hyphenated Rjest alias, and apply it after configuration normalization. Capture
the resulting top-level failure status before execution and keep using it only
for completed unsuccessful runs. Passing runs remain zero, and failures that
occur before a completed result remain status 1.

Extend the differential harness with a distinct CLI scenario. It starts from a
fixture configured to exit 7, supplies `--testFailureExitCode=9` to both
official Jest and Rjest, compares the failed test result, and requires exact
process status 9.

## Consequences

- CI wrappers can preserve an existing Jest failure-code override unchanged.
- Configuration-only behavior remains covered independently at status 7.
- A Rust parser/override test protects the precedence boundary.
- The CLI category grows from 36 to 37 scenarios, and the complete
  compatibility matrix grows from 233 to 234 scenarios.
