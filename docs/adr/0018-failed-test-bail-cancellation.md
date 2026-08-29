# ADR 0018: Enforce failed-test bail thresholds in the coordinator

- Status: accepted
- Date: 2026-08-30

## Context

Jest checks `bail` after each completed test file against the cumulative number
of failed tests, not the number of failed files. Its CLI form is boolean
(`--bail`/`-b`), while configuration can provide a numeric threshold. In a
non-watch run Jest exits as soon as the threshold-reaching result has been
reported, before the outer CLI can serialize its final JSON result.

Rjest previously submitted every discovered file to Rayon and waited for every
Node worker. Merely truncating the final result would still execute user code,
write snapshots, and waste time after the requested stopping boundary.

## Decision

Normalize boolean configuration to zero or one and retain natural-number
thresholds. Apply CLI `--bail` as threshold one and let `--no-bail` override a
configured threshold.

When bail is enabled, share an atomic cancellation flag and mutex-protected
failed-test count across the bounded Rayon pool. Every task checks cancellation
before starting a Node process. Completed results are admitted one at a time;
the result that reaches the threshold is retained and sets cancellation. Queued
tasks do not start, in-flight workers observe cancellation in the coordinator's
process wait loop and are killed, and results arriving after the boundary are
discarded. Final aggregation remains path-sorted.

Match Jest's non-watch CLI boundary by omitting final JSON serialization when
the configured threshold is reached. File-execution marker fixtures compare the
actual scheduled set because Jest intentionally produces no JSON result at that
point.

## Consequences

- A file always finishes all of its tests before its failures affect bail.
- Worker execution errors without failed test cases do not advance the
  threshold, matching Jest's result callback path.
- Parallel completion order determines the exact accepted set, as it does in
  Jest, while the accepted result is aggregated deterministically.
- Cancellation prevents later snapshot persistence and bounds shutdown latency
  for blocked or slow in-flight workers.
