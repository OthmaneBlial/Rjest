# ADR 0047: Keep changed-file instrumentation separate from source collection

- Status: accepted
- Date: 2026-08-30

## Context

Jest narrows coverage during changed-test runs. If only `a.js` changed and the
selected test loads both `a.js` and `b.js`, Jest reports `a.js` but not `b.js`.
When a test file itself changes, Jest also allows that test's direct source
dependencies. This selection is independent from `collectCoverageFrom`, which
can request zero-hit coverage for source files that were never loaded.

Rjest previously used one worker field for both responsibilities. It selected
the correct related test but instrumented every loaded source, so unchanged
`b.js` incorrectly appeared in the report. Reusing the narrowed list as an
unloaded-source list would cause a second incompatibility by reporting unrelated
changed files with zero hits.

## Decision

The dependency graph exposes a conservative changed-coverage set containing:

- each changed path in the selected Jest project; and
- direct resolved dependencies of each changed test file.

An incomplete dependency graph returns no narrowing filter, avoiding false
negative coverage. Test paths are removed before worker dispatch because Jest
does not instrument tests by default.

Runner options now carry two independent values:

- `coverage_filter` controls which loaded modules may be instrumented; and
- `coverage_sources` contains configured `collectCoverageFrom` files that the
  first worker must instrument even when they were not loaded.

When both a configured source set and a changed-file filter exist, Rjest uses
their intersection for both instrumentation and explicit source collection.

## Consequences

- `-o --coverage` excludes loaded but unchanged modules like Jest.
- A changed test can still collect coverage for its direct imported sources.
- Existing `collectCoverageFrom` zero-hit collection remains intact.
- Custom force-coverage and long-tail file-type interactions remain separate
  compatibility work.

The behavior is protected by Rust graph tests and a permanent official-Jest
differential fixture that changes `a.js` while the selected test loads both
`a.js` and `b.js`.
