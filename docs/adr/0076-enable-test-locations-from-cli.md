# ADR 0076: Enable test locations from the CLI

## Status

Accepted.

## Context

Jest's `testLocationInResults` behavior is available both as configuration and
through `--testLocationInResults`. Reporters and editor integrations sometimes
enable the JSON coordinates only for a dedicated machine-readable invocation,
without changing the repository's shared configuration.

Rjest already produced exact one-based declaration coordinates when configured,
but its argument parser rejected the equivalent command-line switch before any
tests ran.

## Decision

Parse Jest's camel-case `--testLocationInResults` flag, with a hyphenated Rjest
alias, and set the normalized location option before deriving project runs.
Reuse worker protocol v27 and the existing stack-frame capture; the CLI changes
only how the same tested behavior is enabled.

Add a separate differential fixture whose configuration deliberately omits
`testLocationInResults`. Pass the CLI switch to official Jest and Rjest and
compare the exact `{line, column}` objects for a top-level and an indented nested
test.

## Consequences

- Machine-readable invocations can request navigable test coordinates without
  modifying Jest configuration.
- The fixture proves observable location values, not only argument acceptance.
- A Rust parser/override test protects the normalized option boundary.
- The CLI category grows from 37 to 38 scenarios, and the complete
  compatibility matrix grows from 234 to 235 scenarios.
