<div align="center">

<img src="site/og-card.png" alt="Rjest, a Rust-powered Jest-compatible test runner" width="100%" />

# Rjest

### A Rust-powered runner for your existing Jest tests

[Website](https://othmaneblial.github.io/rjest/) · [Benchmarks](docs/benchmarks.md) · [Compatibility](docs/compatibility.md) · [Migration guide](docs/migration-from-jest.md)

[![Release: alpha.2](https://img.shields.io/badge/release-0.1.0--alpha.2-f4b942?style=for-the-badge)](https://github.com/OthmaneBlial/Rjest/releases/tag/v0.1.0-alpha.2)
[![Jest differential: 288/288](https://img.shields.io/badge/Jest_differential-288%2F288-bbff2c?style=for-the-badge)](compat/jest-compatibility.json)
[![Benchmarks: 4/4 wins](https://img.shields.io/badge/benchmarks-4%2F4_wins-bbff2c?style=for-the-badge)](benchmarks/results/apple-m2-2026-09-18.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-111511?style=for-the-badge)](LICENSE)

</div>

Rjest runs JavaScript and TypeScript tests with Jest-style assertions, mocks,
snapshots, transforms, and configuration. Rust handles discovery, scheduling,
worker control, result aggregation, and reporting. Node executes your test code.

```diff
- npx jest
+ npx rjest
```

The current alpha is faster than pinned Jest on all four controlled benchmark
workloads below. Its compatibility checks cover 288 executable scenarios;
compare your own suite with both runners before adopting it as a release gate.

## Performance

Apple M2 · 16 GiB · Node 25.9.0 · Jest 30.5.0 · Rjest 0.1.0-alpha.2.
Both runners use disabled caches, two warm-up pairs, and ten alternating measured
pairs. Timing begins only after a correctness preflight matches the expected
execution result or discovered file set.

| Apple M2 · caches off · 10 measured pairs | Jest median | Rjest median |    Rjest vs Jest |
| ----------------------------------------- | ----------: | -----------: | ---------------: |
| Cold start · 1 file, 1 assertion          |    499.6 ms |     241.8 ms | **2.07× faster** |
| Assertion throughput · 50,000 assertions  |      2.87 s |     974.7 ms | **2.95× faster** |
| Discovery · list 1,500 files              |    550.8 ms |     186.8 ms | **2.95× faster** |
| Many files · 48 files, 4 workers          |      1.67 s |       1.20 s | **1.39× faster** |

The many-file benchmark runs all 48 files and 384 tests with four concurrent
workers. Multi-file runs now reuse one Node host, with a fresh worker-thread
isolate for every file. Babel and snapshot formatting tools load when needed.
Globals, environment changes, module caches, and timers stay separate between
files.

Read the [full report](benchmarks/results/apple-m2-2026-09-18.md) for commands,
variance, peak RSS, and environment details, or inspect the
[raw samples](benchmarks/results/apple-m2-2026-09-18.json). The
[original September 1 report](benchmarks/results/apple-m2-2026-09-01.md) retains
the earlier 2.83× many-file regression. These results describe the named
workloads on one machine; performance on other suites needs its own measurement.

## Install the release

Requires Node.js 22.18 or newer and Rust with rustup. The alpha compiles the
native coordinator during installation using the pinned Rust 1.95 toolchain.

Install the optimized `v0.1.0-alpha.2` artifact from GitHub:

```sh
npm install --save-dev https://github.com/OthmaneBlial/Rjest/releases/download/v0.1.0-alpha.2/rjest-rust-runner-0.1.0-alpha.2.tgz
```

Then compare it with Jest in your project:

```sh
npx jest --listTests
npx rjest --listTests

npx jest --runInBand
npx rjest --runInBand

npx rjest --maxWorkers=4
```

Rjest reads your Jest configuration. Unsupported options produce an explicit
error. JSX, TSX, and TypeScript that needs code generation still require an
appropriate Jest transformer.

## Supported behavior

| Area                       | Included in the measured surface                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                      | Nested suites and hooks, async/callback tests, concurrent tests, `.only`, `.skip`, `.todo`, `.failing`, retries, bail, shards, seeded randomization                    |
| Assertions and mocks       | Equality and asymmetric matchers, custom async matchers, `.resolves`/`.rejects`, assertion counts, spies, automocking, manual mocks, CommonJS/ESM mocks, module resets |
| Modules and configuration  | CommonJS, native ESM, top-level await, configured sync/async transforms, executable JS/TS config, presets, multiple projects, custom resolution, pnpm, Yarn PnP        |
| Environments and reporting | Node, JSDOM, custom environment lifecycles, global setup/teardown, custom reporters, test-results processors                                                           |
| Snapshots and timers       | External/inline snapshots, serializers, property matchers, source-mapped writes, modern/legacy fake timers, measured Jest 30 tick modes                                |
| Coverage and watch         | Babel/Istanbul and V8 coverage, merged maps, reports and thresholds, native file watching, Git-aware affected-test selection, interruption of active workers           |

Familiar commands work within those documented boundaries:

```sh
npx rjest --coverage
npx rjest --updateSnapshot
npx rjest --testNamePattern=calculator
npx rjest --projects packages/api packages/web
npx rjest --findRelatedTests src/parser.ts
npx rjest --watch
```

The [compatibility documentation](docs/compatibility.md) records the exact
behavior, supported options, and remaining gaps.

## Compatibility evidence

The differential harness runs the same fixtures under official Jest and Rjest
and compares observable results. Jest 30.5.0 is the default oracle; one
snapshot-format probe intentionally uses Jest 29.7.0.

| Check                                    |               Result |
| ---------------------------------------- | -------------------: |
| Versioned Jest differential scenarios    |            288 / 288 |
| Rust workspace tests                     |            136 / 136 |
| Runtime, packaging, and comparator tests |              15 / 15 |
| Controlled performance workloads         | 4 / 4 faster medians |

Serial and parallel file-isolation fixtures run under both runners. Native
regression tests also check shared-host reuse with fresh file state, Unicode
and raw stdout framing, cancellation, coverage merging, and continued execution
after a file blocks its event loop.

The matrix covers its listed scenarios. Unlisted Jest behavior remains
unverified.

### Pinned real-project reports

The repository preserves [25 corpus reports](docs/corpus), including original
tests from React, React Native, TypeScript, Node, JSDOM, and monorepo projects.
These are results from their pinned captures; every corpus has not been rerun
against this release.

| Project                                                       | Recorded result                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Downshift](docs/corpus/downshift.md)                         | Exact parity: 92 suites, 1,110 tests, 49 snapshots                                   |
| [React Testing Library](docs/corpus/react-testing-library.md) | Exact React 19/JSDOM parity: 16 suites, 251 tests, 11 snapshots                      |
| [styled-components](docs/corpus/styled-components.md)         | Exact web-suite parity: 59 suites, 1,465 tests, 749 snapshots                        |
| [React Navigation](docs/corpus/react-navigation.md)           | 81 suites, 1,303 identities, 169 snapshots, including the same two upstream failures |
| [AWS Amplify Auth](docs/corpus/amplify-auth.md)               | Exact identity, status, and coverage parity: 101 suites, 1,150 tests                 |
| [Apollo Client](docs/corpus/apollo-client.md)                 | 99.940% frozen-status parity: 563 suites, 9,974 identities, zero Rjest-only failures |

## Execution boundaries

Multi-file runs execute in fresh worker threads inside a shared Node host.
Threads share its PID and native process resources. Main-thread-only APIs such
as `process.chdir` are unavailable there, and native crashes or signals against
the host PID can stop the batch. A single-file run uses a separate Node process.
See the [architecture](docs/architecture.md) before migrating tests that depend
on those process details. Test code runs with your permissions.

Persistent discovery/transform caches, signed prebuilt binaries, watch plugins,
some specialized reporters and resolver combinations, and exact custom
environment VM identity remain open work. Keep Jest as your final release gate
until your own project has stable parity. The [project status](docs/project-status.md)
and [migration guide](docs/migration-from-jest.md) describe adoption in more detail.

## Build and verify

```sh
npm ci
make check
cargo build --release -p rjest-cli
npm run benchmark -- --require-faster
```

`make check` runs formatting, strict Clippy, all Rust tests, runtime/comparator
checks, a native build, and the complete differential matrix. The performance
gate writes all raw samples and fails if any workload lacks a strictly faster
Rjest median. `npm run benchmark:quick` is for development comparisons.

Checks run locally; this repository has no automatic GitHub Actions workflows.
See the [development guide](docs/development.md) for prerequisites and commands.

If your suite behaves differently, add a small fixture that reproduces the
mismatch under Jest and Rjest. A failing test with an exact command gives the
next fix a clear target.

[Open an issue](https://github.com/OthmaneBlial/Rjest/issues) · [Read the benchmark method](docs/benchmarks.md) · [Browse the source](crates)
