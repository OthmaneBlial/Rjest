# ADR 0034: Filter normalized projects by display name before discovery

- Status: accepted
- Date: 2026-08-30

## Context

Jest monorepos often keep one project matrix but select a subset in scripts with
`--selectProjects` or exclude expensive/platform-specific projects with
`--ignoreProjects`. Accepting `--projects` without these display-name filters
still forced users to rewrite common commands.

Official Jest first keeps projects named by `--selectProjects`, then removes
names listed by `--ignoreProjects`. Unnamed projects never match a selection but
survive ignore-only filtering. An empty filtered matrix fails as a no-test run.
Jest also prints missing-name warnings and a deterministic summary of the
projects that will run.

## Decision

Accept variadic select and ignore name arrays and apply both predicates to the
fully normalized execution matrix before discovery, sharding, coverage setup,
or worker scheduling. Preserve project order for execution while sorting names
only in the multi-project summary.

Emit Jest-shaped missing-name, empty-selection, one-project, and multi-project
messages. Write them to stderr for JSON output and stdout otherwise, following
Jest's machine-output boundary.

## Consequences

- Existing display-name project scripts can replace only the runner name.
- Selection cannot accidentally match an unnamed project, while ignore-only
  invocations continue to run unnamed projects.
- Empty selections fail before workers are scheduled.
- Separate select-only and ignore-only differential scenarios preserve exact
  suite/test identities and statuses against official Jest.
