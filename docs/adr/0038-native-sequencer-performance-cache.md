# ADR 0038: Persist native default-sequencer performance data

- Status: accepted
- Date: 2026-08-30

## Context

Jest's default test sequencer persists each executed file's failure state and
duration. Later runs use this information to prioritize previous failures,
leave uncached files ahead of timed successes, and start slower files earlier.
`--onlyFailures` uses the same cache to select the files that failed previously.

Rjest previously implemented only Jest's cold-cache, larger-file-first fallback
for combined bail-enabled project matrices. It rejected `--onlyFailures`, did
not reorder ordinary warm runs from performance history, and could not rerun a
previous file-level execution error without running the complete suite.

## Decision

Keep the default sequencer in the Rust coordinator and persist a compact JSON
map below the configured cache directory. Partition entries by a
normalized project-context digest and test path. Missing, malformed, or
partially stale cache data is treated as absent rather than preventing a run.

Apply default sharding before sequencing. Stable-sort the combined selected
test units in Jest's priority order: cached failures first, uncached files before
timed files, longer cached durations first, then larger uncached files first.
Every unit retains its owning project configuration when adjacent Rust runs are
rebuilt.

After a completed non-bailed execution, record assertion failures and
file-level execution errors together with wall-clock file duration. Do not
overwrite a previous entry when the entire file result is skipped. Match the
observed non-watch bail lifecycle by leaving the performance cache unchanged
when the threshold terminates the run.

Normalize `onlyFailures` from configuration and expose Jest's `--onlyFailures`
and `-f` forms. For the native sequencer, retain only paths whose cached status
is failed. A cold selection prints `No failed test found.` and follows Jest's
ordinary no-test exit semantics; list-only mode emits an empty list
successfully.

## Consequences

- Warm default runs prioritize useful feedback and long-running work like Jest.
- Native `--onlyFailures` works across separate Rjest processes without a Node
  sequencer bridge.
- Custom sequencers still own their independent `allFailedTests` and
  `cacheResults` behavior through ADR 0037.
- Permanent differentials cover custom async selection, warm and cold native
  caches, bail finalization, skipped-suite retention, and zero-test file errors.
- Cache-control behavior is specified by ADR 0039.
