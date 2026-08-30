# ADR 0042: Keep custom reporters alive across the Rust-coordinated run

- Status: accepted
- Date: 2026-08-30

## Context

Jest treats `reporters` as run-wide stateful plugins. It resolves CommonJS or
ESM classes, constructs each one with the global config, options, and reporter
context, then awaits lifecycle methods in configuration order. The same
instance receives run, file, and test-case events. A final `getLastError()` can
make an otherwise passing test run fail.

Rjest previously rejected the `reporters` field as unsupported. Spawning a new
Node process for every callback would accept the syntax but lose reporter
state, module identity, async ordering, and the final error contract.

## Decision

Normalize Jest's string and `[module, options]` reporter forms while preserving
the distinction between an implicit default reporter and an explicitly empty
list. Resolve path, package, CommonJS, ESM, and configured-resolver modules in
a persistent Node bridge. Construct custom reporters once and retain that
process for the complete Rust-coordinated run.

Expose thread-safe file and live test-case observations from the bounded Rust
runner. Worker protocol v24 writes framed case events to stdout while a test
file remains active; the Rust coordinator drains them concurrently with worker
execution. The bridge serializes reporter dispatch, applies Jest's modern-to-legacy
`onTestFileStart`/`onTestStart` and `onTestFileResult`/`onTestResult` fallbacks,
projects Jest-shaped file and assertion results, dispatches case callbacks,
and calls `onRunComplete` followed by `getLastError`. Reporter hook failures
abort execution, and final reporter errors participate in the CLI exit code.

Keep Rjest's native output only when the configured list contains Jest's
`default`, `agent`, or `summary` reporter. A custom-only or empty reporter list
must not leak the native default summary.

## Consequences

- Existing configs can load stateful CommonJS and top-level-await ESM custom
  reporters without source changes.
- Async lifecycle methods are awaited, stdout is forwarded, multi-project test
  contexts retain display names/colors, and parallel file workers share one
  ordered reporter dispatcher.
- Seven differential fixtures cover lifecycle payloads, legacy fallbacks,
  reporter-controlled failure, thrown hooks, custom-only output, multi-project
  contexts, bounded parallel dispatch, and live test-case timing.
- Worker protocol v24 emits framed case-start/result messages while the test
  file is active. Rust drains those messages without waiting for process exit,
  serializes them through the persistent reporter bridge, and aborts the active
  worker if a case callback fails. Runnable, skipped, todo, raw-stdout, and
  inter-test result ordering are permanent differential or Rust regressions.
- Specialized built-ins such as `github-actions` and interactive agent output
  still need their own native behavior and differential coverage.
