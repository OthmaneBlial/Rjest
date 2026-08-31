# ADR 0082: Distinguish pattern and exact test-path selection

## Status

Accepted.

## Context

Jest treats positional test-path arguments and `--testPathPatterns` values as
regular expressions. It treats the same input literally only when
`--runTestsByPath` is present. Rjest rejected both options and opportunistically
treated any positional value naming an existing file as exact, which inverted
Jest's behavior for paths containing regex metacharacters.

For example, the pattern `literal[1].test.cjs` selects `literal1.test.cjs`, while
the exact-path mode selects the existing `literal[1].test.cjs` file.

## Decision

Accept the Jest 30 `--testPathPatterns` spelling, the Jest 29 singular spelling,
hyphenated aliases, and `--runTestsByPath`. Preserve positional and option
inputs separately for public global configuration, then combine them for
discovery.

Add a regex discovery path that compiles all patterns and walks configured
roots. Keep literal resolution behind the explicit by-path mode. Apply the same
selection mode in ordinary execution, listing, changed selection, and watch
cycles.

## Consequences

- IDE and CI invocations can use the official Jest flags unchanged.
- Existing filenames no longer silently change regex arguments into literals.
- Exact missing paths fail instead of falling back to substring selection.
- The CLI category grows from 57 to 60 scenarios, and the complete
  compatibility matrix grows from 254 to 257 scenarios.
