# ADR 0074: Report test declaration locations

## Status

Accepted.

## Context

When `testLocationInResults` is enabled, Jest adds the one-based source line and
column of each test declaration to its JSON assertion result. IDEs, reporters,
and test-navigation integrations use those coordinates to link a result back to
source.

Rjest rejected the configuration option and its test protocol contained no
location field. Merely accepting the option would unblock startup but leave
those integrations with incomplete JSON.

## Decision

Normalize `testLocationInResults` with Jest's `false` default and carry it over
worker protocol v27. When enabled, capture the first stack frame belonging to
the active test file during `defineTest`, retain the one-based line and column
on the test node, and serialize that location on every result status.

Reuse the same test-file frame parser used to infer inline-snapshot callsites so
file URL and platform path normalization stay consistent. Extend the
differential normalizer only to canonicalize JSON object-key order; line and
column values remain strict comparisons.

## Consequences

- JSON output can link passing, failing, skipped, and todo results to their
  declaration when the option is enabled.
- Default output remains unchanged because absent locations are omitted.
- A permanent differential fixture compares exact coordinates for top-level
  and indented nested tests.
- The Configuration category grows from 50 to 51 scenarios, and the complete
  compatibility matrix grows from 232 to 233 scenarios.
