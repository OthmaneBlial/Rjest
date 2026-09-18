# Benchmarks

Rjest performance claims start with executable workloads, not a stopwatch around
one convenient demo. The benchmark lab compares the pinned official Jest and the
release-mode Rjest binary on the same generated files and refuses to start timing
until both runners agree on the expected suites, tests, passes, failures, file
errors, or discovered path set.

## Current controlled result

The optimized report was captured from clean commit `22341d9`
on September 18, 2026, using an Apple M2 with 16 GiB of memory, Node 25.9.0,
the pinned Jest 30.5.0 package, and Rjest 0.1.0-alpha.2. It used two warm-up
pairs and ten alternating measured pairs per workload with caches disabled
for both runners. Rjest wins all four medians and every one of the 40 measured
pairs.

| Apple M2 · caches off · 10 measured pairs | Jest median | Rjest median |    Rjest vs Jest |
| ----------------------------------------- | ----------: | -----------: | ---------------: |
| Cold start · 1 file, 1 assertion          |    499.6 ms |     241.8 ms | **2.07× faster** |
| Assertion throughput · 50,000 assertions  |      2.87 s |     974.7 ms | **2.95× faster** |
| Discovery · list 1,500 files              |    550.8 ms |     186.8 ms | **2.95× faster** |
| Many files · 48 files, 4 workers          |      1.67 s |       1.20 s | **1.39× faster** |

Read the [formatted Apple M2 report](../benchmarks/results/apple-m2-2026-09-18.md)
for variability, memory observations, exact commands, versions, and limitations.
The [raw JSON report](../benchmarks/results/apple-m2-2026-09-18.json) retains all
timing and peak-RSS samples. The unchanged 48-file workload still executes all
384 tests with four concurrent workers.

The [September 1 report](../benchmarks/results/apple-m2-2026-09-01.md) and
[raw samples](../benchmarks/results/apple-m2-2026-09-01.json) remain available
as the historical baseline, including its 2.83 times many-file regression.
Multi-file execution now reuses a Node host with fresh worker-thread isolates;
default Babel and snapshot formatting tools load on demand. See
[ADR 0096](adr/0096-reuse-node-host-with-fresh-file-isolates.md) for the decision
and execution boundaries.

## Workloads

| Workload             | Measured boundary                                 | Why it exists                                      |
| -------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Cold start           | One Node test file and one assertion              | Measures end-to-end CLI latency                    |
| Assertion throughput | 50,000 Jest-style equality assertions in one file | Isolates runtime assertion and reporting overhead  |
| Many files           | 48 files and 384 tests with four workers          | Exposes scheduling and fresh-process startup costs |
| Discovery            | `--listTests` over 1,500 deterministic files      | Isolates configuration and filesystem discovery    |

The mix is deliberate. It includes paths where Rust coordination may help and a
many-file path that measures isolate startup and dispatch costs. Multi-file
batches reuse a Node host while every file gets a fresh execution isolate. A
published report must retain losing workloads and earlier reports.

## Reproduce locally

```sh
npm ci
cargo build --release -p rjest-cli
npm run benchmark -- --require-faster
```

`npm run benchmark:quick` uses one warm-up and three measured pairs for harness
development. It is not sufficient for a published project claim. The full run
uses two warm-up pairs and ten measured pairs for each workload. Runner order
alternates within every pair so one tool does not consistently inherit the same
thermal or ordering conditions.

`--require-faster` fails unless all measured workloads have a strictly lower
Rjest median. Reports are written before the gate runs, so a regression remains
inspectable. The gate compares the same generated workloads and never drops
a losing case.

Local reports are written to `benchmarks/results/local/` and ignored by Git. To
create a reviewable report explicitly:

```sh
npm run benchmark -- \
  --output=benchmarks/results/<machine>-<date>.json
```

The command writes raw JSON samples and a Markdown report with the exact commands,
versions, machine details, medians, means, ranges, standard deviation, and peak
RSS where `/usr/bin/time` supports it.

## Publication policy

A report can support README or website language only when all of these are true:

1. The source worktree is clean and the report names its exact commit.
2. `package-lock.json` supplies the official Jest version and Rjest is built in
   release mode from that commit.
3. Both runners use equivalent cache, CI, serial, and worker-count settings.
4. Correctness preflight passes before timing begins.
5. Warm-ups, every raw measured sample, medians, spread, commands, versions,
   hardware, operating system, and memory method remain inspectable.
6. The claim names the workload. A win in discovery or assertion throughput is
   not described as universal test-suite speed.
7. Regressions stay beside wins, especially the many-file startup boundary.

Wall time includes CLI startup, configuration, discovery, test execution,
reporting, and shutdown. Peak RSS is the maximum value reported by
`/usr/bin/time` for the launched command; it is not presented as the sum of every
concurrently live worker. Results describe one controlled machine and should be
repeated on other operating systems and hardware before making broad claims.
