# ADR 0077: Apply common runtime CLI overrides

## Status

Accepted.

## Context

Real Jest commands commonly enable open-handle diagnostics, disable injected
globals, or adjust the default test timeout for one invocation. Rjest already
implemented the corresponding normalized configuration fields, but rejected
`--detectOpenHandles`, `--injectGlobals`, `--no-injectGlobals`, and
`--testTimeout` before execution.

These options also exposed two less obvious contracts. CLI project options must
reach every normalized child project, and Jest forces serial execution for open
handle detection without rewriting the requested `maxWorkers` value observed by
custom reporters.

## Decision

Accept Jest's camel-case flags, their useful hyphenated aliases, explicit
boolean values for positive flags, and negative forms for open-handle detection
and global injection. Apply the normalized values recursively to the root and
all child projects together with `testLocationInResults`.

Keep the scheduler at one effective worker whenever open-handle detection is
active. Build reporter `globalConfig.maxWorkers` from the requested CLI/config
value in that mode while retaining `runInBand: true`, matching official Jest's
observable split between execution and configuration.

Preserve four differential scenarios: each standalone override and a combined
two-project case that proves global injection, timeout precedence, and exact
test locations in both child projects.

## Consequences

- Existing diagnostic and machine-readable Jest commands need fewer edits.
- `--injectGlobals=false` and `--no-injectGlobals` share one normalized result.
- A configured 10 ms timeout can be safely overridden by the CLI in both root
  and child project runs.
- Reporter integrations observe Jest-compatible open-handle and worker values.
- The CLI category grows from 38 to 42 scenarios, and the complete
  compatibility matrix grows from 235 to 239 scenarios.
