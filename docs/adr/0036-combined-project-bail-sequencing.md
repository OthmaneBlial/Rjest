# ADR 0036: Sequence bail across the combined project matrix

- Status: accepted
- Date: 2026-08-30

## Context

Jest collects tests from every selected project context, applies sharding, and
then passes the combined test set to its sequencer. When its performance cache
is disabled or empty, the default sequencer runs larger files first. This order
is observable with serial `--bail` because files after the threshold-reaching
failure are never executed.

Rjest previously executed complete project groups in configuration order. A
small passing file from the first project therefore ran before a larger failing
file from the second project, even though official uncached Jest ran the failure
first and stopped without executing the passing file.

## Decision

After shard selection, flatten bail-enabled matrices with more than one active
project context into test units that retain references to their owning
normalized project configuration. Stable-sort the combined units by file size
descending, matching Jest's uncached fallback, and rebuild adjacent runs only
when they share the same project context. Preserve the established bounded
runner path unchanged when zero or one project has discovered tests.

The execution coordinator continues to apply the remaining global bail
threshold before every rebuilt run. Each unit therefore keeps its own resolver,
transform, environment, setup, snapshot, coverage, and display-name settings.

## Consequences

- Serial default bail observes the same cross-project file boundary as uncached
  Jest after sharding.
- Equal-sized files retain deterministic discovery order.
- Adjacent files owned by one project can still use the bounded runner together;
  transitions between project contexts remain coordinator boundaries.
- A permanent execution-marker differential proves the previous extra-file
  execution and the repaired behavior.
- Rjest does not yet persist Jest's failure/duration performance cache or execute
  custom test sequencers; those ordering modes remain explicit compatibility
  work.
