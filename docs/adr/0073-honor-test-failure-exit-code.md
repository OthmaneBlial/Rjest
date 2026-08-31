# ADR 0073: Honor testFailureExitCode

## Status

Accepted.

## Context

Jest normally exits with status 1 after an unsuccessful test run, but
`testFailureExitCode` lets a repository choose another status. CI pipelines and
wrapper scripts can use that distinction as part of their public contract.

Rjest's strict configuration loader rejected the option and its top-level
entrypoint collapsed every unsuccessful run to status 1, even when test
execution and reporting otherwise matched Jest.

## Decision

Normalize `testFailureExitCode` with Jest's default value of 1. Return both the
boolean run result and configured failure status from the top-level execution
path, and use the configured status only when a completed test run is
unsuccessful. Keep configuration and runner errors on the existing status-1
boundary because no valid completed result exists in those cases.

## Consequences

- Passing runs continue to exit zero.
- Failed tests, reporter failures, processed-result failures, and coverage
  threshold failures use the normalized configured status.
- Configuration/runtime errors remain distinguishable at status 1.
- A permanent differential fixture preserves one identical failed test and
  exact status 7 under official Jest and Rjest.
- The Configuration category grows from 49 to 50 scenarios, and the complete
  compatibility matrix grows from 231 to 232 scenarios.
