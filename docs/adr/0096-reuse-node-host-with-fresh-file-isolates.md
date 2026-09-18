# ADR 0096: Reuse a Node host with fresh file isolates

Status: accepted

## Context

The original 48-file, four-worker benchmark was 2.83 times slower than Jest.
Deferring the default Babel transformer reduced unnecessary CJS setup, but a
new local development run still measured a 1.70 times regression. Fresh Node
process startup remained an expense for every file.

## Decision

For batches containing multiple files, reuse one Node host and execute each
file in a new worker-thread isolate. Keep Rust's bounded scheduler, snapshot
ownership, protocol validation, observer callbacks, cancellation, and per-file
deadlines. Route output by canonical test path and wait for both output streams
to finish before releasing the file's scheduler slot. Keep single-file runs on
the existing process path.

Resolve the default Babel transformer during setup but initialize it on the
first matching module. Do not bypass matching dependencies or configured
transformers. Add an optional benchmark gate that fails unless every measured
workload has a strictly lower Rjest median, retaining reports on failure.
Load snapshot formatting tools on demand and avoid docblock-parser loading when
the source has no leading block comment. Keep serializer setup and docblock
semantics for files that use them.

## Consequences

Files have separate globals, environment-variable changes, CommonJS caches,
mock state, and timers. A synchronous JavaScript loop can be terminated without
discarding the host, so subsequent files still run after a timeout.

Threads share a PID and native process resources. Native crashes or signals
against the host PID affect the batch, and APIs restricted to Node's main
thread differ from Jest's default process workers. This change does not claim
universal compatibility or universal speed. Fresh threads still load matching
transformers separately; persistent transform caches remain open work.

Regression tests cover host reuse with fresh file state, Unicode and native
stdout framing, cancellation, coverage aggregation, and continued execution
after a blocked-file timeout. The complete Jest differential matrix and full
paired benchmarks remain release gates.
