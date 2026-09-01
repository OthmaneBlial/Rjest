# Benchmarks

Rjest performance claims start with executable workloads, not a stopwatch around
one convenient demo. The benchmark lab compares the pinned official Jest and the
release-mode Rjest binary on the same generated files and refuses to start timing
until both runners agree on the expected suites, tests, passes, failures, file
errors, or discovered path set.

No controlled result is published yet. The first committed machine report will
be linked here after the full benchmark completes from a clean source commit.

## Workloads

| Workload             | Measured boundary                                 | Why it exists                                      |
| -------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Cold start           | One Node test file and one assertion              | Measures end-to-end CLI latency                    |
| Assertion throughput | 50,000 Jest-style equality assertions in one file | Isolates runtime assertion and reporting overhead  |
| Many files           | 48 files and 384 tests with four workers          | Exposes scheduling and fresh-process startup costs |
| Discovery            | `--listTests` over 1,500 deterministic files      | Isolates configuration and filesystem discovery    |

The mix is deliberate. It includes paths where Rust coordination may help and a
many-file path where Rjest's current one-process-per-file isolation can cost more
than Jest's reused workers. A published report must retain losing workloads.

## Reproduce locally

```sh
npm ci
cargo build --release -p rjest-cli
npm run benchmark
```

`npm run benchmark:quick` uses one warm-up and three measured pairs for harness
development. It is not sufficient for a published project claim. The full run
uses two warm-up pairs and ten measured pairs for each workload. Runner order
alternates within every pair so one tool does not consistently inherit the same
thermal or ordering conditions.

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
