# ADR 0039: Control and safely clear sequencer caches

- Status: accepted
- Date: 2026-08-30

## Context

Jest exposes project-level `cache` and `cacheDirectory` configuration together
with CLI `--cache`, `--no-cache`, and `--clearCache`. Its no-cache mode resets
old state before a run but can still write fresh sequencer performance data when
execution completes. `--clearCache` removes every distinct configured project
cache directory and exits before discovery.

Rjest's first native performance cache always used an internal temporary path.
Users could neither isolate it with an existing Jest config nor invalidate a
previous failure before `--onlyFailures`. Blindly copying Jest's recursive
directory removal would also permit dangerous targets such as a project root or
home directory.

## Decision

Normalize `cache` and root-relative `cacheDirectory` into every project config.
Use a Rjest-namespaced operating-system temporary directory by default so the
runner does not mutate or clear official Jest's default cache. Forward the
normalized flag and directory to custom sequencer contexts and store the native
performance file under the same configured directory.

Accept explicit CLI `--cache` and `--no-cache` as conflicting overrides, plus
`--cacheDirectory` and `--clearCache`. Apply cache overrides to every selected
project context. When cache reads are disabled, remove the exact native
performance file before sorting; a completed non-bailed execution may then
persist fresh data, matching the observed Jest lifecycle.

For clear-cache mode, deduplicate normalized project directories, delete each
one before discovery, print `Cleared <path>`, and exit successfully. Refuse any
target that is non-absolute or equals a filesystem root, the current directory,
the operating-system temporary root, the user's home directory, or any selected
project root.

## Consequences

- Existing Jest configs can locate Rjest sequencer data in an explicit cache
  directory and CLI flags have tested precedence over config.
- `--no-cache --onlyFailures` cannot reuse stale failure history, while an
  ordinary completed no-cache run can establish fresh history.
- `--clearCache` has Jest-shaped successful behavior for safe configured paths
  without exposing repository-wide recursive deletion.
- The differential harness now supplies `--no-cache` symmetrically to both
  runners outside explicit cache lifecycle scenarios.
- Persistent transform, discovery, and dependency caches remain future work;
  this ADR does not claim those Jest cache effects.
