# Changelog

## 0.1.0-alpha.2 · 2026-09-18

Multi-file execution reuses one Node host and gives every test file a fresh
worker-thread isolate. This removes repeated process startup while keeping
file-local globals, environment changes, module caches, mocks, and timers
separate. Rust still controls concurrency, live reporting, snapshots,
cancellation, protocol validation, and file deadlines.

The default Babel transformer initializes on the first matching module,
including dependencies loaded by CJS tests. Snapshot formatting loads when
needed, and files without a leading block comment avoid docblock-parser setup.
Configured custom transformers keep their asynchronous initialization path.

The [controlled Apple M2 report](benchmarks/results/apple-m2-2026-09-18.md)
records ten alternating measured pairs after two warm-ups, with caches disabled
and correctness preflight:

| Workload                            | Rjest vs Jest |
| ----------------------------------- | ------------: |
| Cold start                          |  2.07× faster |
| 50,000 assertions                   |  2.95× faster |
| 48 files / 384 tests / four workers |  1.39× faster |
| Discovery of 1,500 files            |  2.95× faster |

Every measured pair favored Rjest. The original September 1 report, including
its 2.83× many-file regression, remains available. Results apply to these
workloads on the recorded machine.

The local gate passes 136 Rust tests, 15 runtime/package/comparator tests, and
288 Jest differential scenarios. New serial and parallel fixtures compare file
isolation with official Jest. Regression tests cover host reuse, Unicode and
raw stdout framing, cancellation, merged coverage, and continued execution
after a blocked-file timeout. The benchmark's new `--require-faster` option
retains reports and fails if any measured workload lacks a faster Rjest median.

The README now leads with the benchmark results and includes versioned release
installation, supported behavior, historical corpus evidence, and adoption
guidance. Package smoke checks exercise two suites in a fresh install and can
retain the exact validated tarball for a GitHub release.

Multi-file workers share a PID and native process resources. Main-thread-only
APIs such as `process.chdir` are unavailable there; native crashes or signals
against the host PID can stop the batch. Single-file runs retain a separate
process. See [ADR 0096](docs/adr/0096-reuse-node-host-with-fresh-file-isolates.md).
The historical real-project corpora have not all been rerun against this alpha.

## 0.1.0-alpha.1 · 2026-09-01

The first npm alpha was published as `rjest-rust-runner`, with install-time Rust
compilation and the `rjest` command. Its recorded milestone passed 286 Jest
differential scenarios. The [first controlled performance report](benchmarks/results/apple-m2-2026-09-01.md)
measured wins in startup, assertions, and discovery, with a many-file startup
regression.
