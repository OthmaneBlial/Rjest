# ADR 0079: Apply CLI setup and concurrency overrides

## Status

Accepted.

## Context

Focused Jest invocations commonly replace configured globals, setup modules,
or the concurrency cap without editing project configuration. Official Jest
accepts `--globals`, `--maxConcurrency`, `--setupFiles`, and
`--setupFilesAfterEnv`; Rjest previously rejected all four options even though
their normalized configuration fields and runtime behavior already existed.

Jest treats the setup-module CLI values as replacements for configured arrays,
not additions. That precedence is observable because only the modules named on
the command line execute.

## Decision

Accept a JSON object for `--globals`, require a positive integer for
`--maxConcurrency`, and collect one or more module references from
`--setupFiles` and `--setupFilesAfterEnv`. Apply each provided value recursively
to every normalized child project. Normalize setup module references from the
owning project's root and replace the configured lists.

Keep each behavior in an independent differential fixture. The fixtures verify
exact global values, an observed concurrency peak of two, replacement of a
pre-framework setup module, and replacement of a post-framework module that
installs a custom matcher.

## Consequences

- Common focused Jest commands now work without configuration edits.
- Invalid JSON objects and zero concurrency fail during CLI parsing.
- Multi-project runs resolve relative setup paths from each child root.
- Setup arrays follow Jest's replacement precedence.
- The CLI category grows from 44 to 48 scenarios, and the complete
  compatibility matrix grows from 241 to 245 scenarios.
