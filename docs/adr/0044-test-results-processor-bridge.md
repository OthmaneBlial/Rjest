# ADR 0044: Run Jest test-results processors in a post-teardown Node bridge

- Status: accepted
- Date: 2026-08-30

## Context

Jest resolves `testResultsProcessor` as a run-wide module, awaits its exported
function after reporters, sequencer caching, and global teardown, then formats
the returned aggregate for JSON and passes it to the completion callback. The
processor may inspect or replace result fields, perform external reporting,
return a promise, and change `success`, which affects the CLI exit status.

Rjest aggregates a compact Rust-owned result whose wire shape intentionally
differs from Jest's public `AggregatedResult`. Passing that internal object to
ecosystem processors would make the option appear supported while breaking
real integrations. Running the processor before teardown would likewise alter
observable ordering and hide teardown environment changes.

## Decision

After reporter completion, sequencer caching, coverage aggregation, and global
teardown, the Rust coordinator starts a one-shot Node bridge. It forwards the
final environment delta from the persistent global-hook process and sends the
internal aggregate plus per-file coverage over a prefixed JSON protocol.

The bridge converts the payload to Jest-shaped aggregate, suite, assertion,
snapshot, coverage, error, and performance records. It resolves modules from
the configured root, participates in a synchronous custom resolver when one is
configured, accepts CommonJS and native ESM default exports, and awaits the
processor result. It then applies Jest's formatted-JSON projection and returns
that value to Rust. Rust uses the processed value for `--json`/`--outputFile`
and uses its boolean `success` field for the final exit status.

The processor also runs for successful empty suites, matching Jest's
post-scheduler lifecycle. Processor exceptions or invalid exports stop result
emission and exit with failure.

## Consequences

- Existing synchronous, asynchronous, CommonJS, and ESM result integrations
  can run without source changes in the covered cases.
- Processors observe global teardown side effects and environment changes.
- Custom fields survive into formatted JSON, and returned `success` can alter
  the process exit code as it does in Jest.
- Processor stdout is forwarded, while the bridge protocol remains isolated by
  a marker.
- Rjest still cannot reproduce live V8 open-handle objects or undocumented
  in-process object identity across its Rust/Node boundary. Error records are
  JSON-safe Jest-shaped projections rather than the original worker realms.

Permanent differential fixtures cover configuration and CLI selection,
post-teardown ordering, aggregate counts/statuses, processed output, and
processor failures against official Jest.
