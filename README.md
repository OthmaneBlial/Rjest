<div align="center">

# RJEST

### Switch the runner. Keep the test suite.

An independent Jest-compatible test runner with a Rust coordinator and isolated Node workers.

[Website](https://othmaneblial.github.io/rjest/) · [Compatibility](docs/compatibility.md) · [Migration guide](docs/migration-from-jest.md) · [Architecture](docs/architecture.md)

![Status](https://img.shields.io/badge/status-alpha-f4b942?style=flat-square)
![Differential scenarios](https://img.shields.io/badge/differential_scenarios-184%2F184-c8ff3d?style=flat-square)
![Rust](https://img.shields.io/badge/coordinator-Rust-111511?style=flat-square&logo=rust)
![Node](https://img.shields.io/badge/runtime-Node_22.18%2B-111511?style=flat-square&logo=nodedotjs)
![License](https://img.shields.io/badge/license-MIT-111511?style=flat-square)

</div>

```text
npx jest
    ↓
npx rjest
```

That is the destination: existing Jest projects changing the command, not their
tests. Rjest already runs substantial React, TypeScript, Node, JSDOM, ESM,
snapshot, mock, fake-timer, coverage, and monorepo workloads without source
changes. It is still alpha software, so prove your own suite before replacing
Jest as a release gate.

## Compatibility you can inspect

No invented percentage. No hand-picked screenshot. Every published number is
tied to an executable differential fixture or a pinned real-world corpus.

| Proof | Official Jest | Rjest |
| --- | ---: | ---: |
| Versioned differential matrix | 184 / 184 scenarios | 184 / 184 scenarios |
| Downshift | 92 suites · 1,110 tests · 49 snapshots | exact parity |
| styled-components web | 59 suites · 1,465 tests · 749 snapshots | exact parity |
| React Navigation | 81 suites · 1,303 identities · 169 snapshots | exact parity, including the same 2 upstream failures |
| AWS Amplify Auth | 101 suites · 1,150 tests | exact identity, status, and coverage parity |
| Apollo Client | 563 suites · 9,974 identities · 519 snapshots | 99.940% frozen-status parity, zero Rjest-only failures |

The 184/184 result is **100% of the versioned scenarios currently in the
matrix**, not 100% of the entire Jest API. The repository also contains 24
documented corpus reports spanning React, React Native, TypeScript, JSDOM,
CommonJS, native ESM, npm, pnpm, Yarn workspaces, and Yarn Plug'n'Play.

[Read the generated matrix →](compat/jest-compatibility.json)

## What already works

- Jest-style `describe`, `test`, `it`, hooks, focus, skip, todo, retries, bail,
  seeded randomization, sharding, and failed-test reruns.
- Common matchers, asymmetric matchers, custom async matchers, `.resolves`,
  `.rejects`, assertion counts, mocks, spies, module mocks, and automocking.
- External and inline snapshots, property matchers, serializers, update mode,
  Prettier 2/3 formatting, and source-mapped inline snapshot writes.
- JavaScript, configured JSX/TS/TSX transforms, CommonJS, native ESM,
  top-level await, async transformers, Node, JSDOM, and custom environments.
- Modern and legacy fake timers, including automatic advancement and the
  covered Node/JSDOM scheduling boundaries.
- Jest config discovery, executable JS/TS configs, omitted `undefined`
  properties, presets, multi-project matrices, display-name filters, custom
  resolvers, custom sequencers, pnpm, and Yarn Plug'n'Play.
- CommonJS, ESM, and transformed TypeScript `globalSetup`/`globalTeardown`,
  including async hooks, CLI overrides, setup environment propagation,
  multi-project selection/deduplication, and teardown after test failures.
- Awaited CommonJS and ESM `testResultsProcessor` modules from configuration or
  CLI, with Jest-shaped aggregate data, post-teardown ordering, processed JSON,
  and processor-controlled exit status.
- Stateful CommonJS and ESM custom reporters with awaited run/file/case hooks,
  legacy hook fallbacks, multi-project contexts, and `getLastError()` exits.
- Istanbul/Babel coverage with JSON, text, LCOV/HTML, Clover, source-map
  remapping, merging, global thresholds, and changed-file-aware instrumentation
  that excludes loaded but unchanged sources like Jest.
- Jest-compatible cache controls for failure/duration sequencer history.
- Native `--watchAll` with debounced recursive filesystem events, fresh test
  discovery, failure recovery, and add/delete lifecycle parity with Jest.
- Git-aware `--watch` with staged, modified, deleted, and untracked change
  detection plus transitive CommonJS/ESM and mapped-module affected-test
  selection. Projects outside Git fail with Jest-compatible `--watchAll`
  guidance instead of silently running the wrong scope.
- One-shot Git-aware `-o`/`--onlyChanged`, `--lastCommit`, `--changedSince`,
  and `--changedFilesWithAncestor` selection, including Jest's `--all` and
  positional-path precedence and successful empty results outside source
  control.

## Try Rjest on an existing project

Rjest is not published as an npm package yet. Build the current alpha from the
repository so the binary and its pinned compatibility dependencies stay
together:

```sh
git clone https://github.com/OthmaneBlial/rjest.git
cd rjest
npm ci
cargo build --release -p rjest-cli
```

Then point the binary at a Jest project:

```sh
cd /path/to/your-jest-project
/path/to/rjest/target/release/rjest --listTests
/path/to/rjest/target/release/rjest --runInBand
/path/to/rjest/target/release/rjest
```

Start with discovery, run serially, compare both runners, then enable Rjest's
default bounded parallel execution.

## Familiar commands, native coordination

```sh
rjest --coverage
rjest --updateSnapshot
rjest --testNamePattern=calculator
rjest --maxWorkers=50%
rjest --projects packages/api packages/web
rjest --selectProjects web --ignoreProjects legacy
rjest --shard=1/3
rjest --randomize --seed=1234
rjest --testSequencer=./tools/sequencer.cjs
rjest --globalSetup=./tools/setup.cjs
rjest --globalTeardown=./tools/teardown.mjs
rjest --testResultsProcessor=./tools/process-results.mjs
rjest --onlyFailures
rjest --watch
rjest --watchAll
rjest --forceExit --no-coverage
rjest --no-cache
rjest --clearCache
```

Unknown Jest configuration options fail explicitly instead of disappearing
silently.

## Why Rust and Node?

```text
Jest project
    ↓
Rust — config, discovery, scheduling
    ↓
Node workers — run test files
    ↓
Rust — results, snapshots, coverage
```

Rust owns configuration normalization, native discovery, dependency indexing,
scheduling, process management, aggregation, coverage merging, and snapshot persistence. Node owns
JavaScript execution, real module semantics, Jest ecosystem transformers, and
environment integrations. Each test file gets a fresh process today: strong
isolation and deterministic aggregation, with startup cost that still needs to
be reduced.

The boundary is documented in [ADR 0001](docs/adr/0001-hybrid-node-runtime.md).

## Alpha boundaries

Rjest is genuinely useful for compatibility work, but it is not yet a universal
drop-in replacement.

- Interactive watch controls/plugins, stale-run cancellation, Mercurial/Sapling
  changed-file selection, and V8 coverage are not implemented. Native
  `--watchAll` and Git-aware dependency selection with `--watch` are available.
- Persisted transform/discovery caches and worker reuse are still open, so
  transform-heavy projects can be materially slower than Jest.
- Exact custom-environment VM-context identity, live reporter case-event timing,
  specialized reporter built-ins, path/glob coverage thresholds, and long-tail
  resolver/PnP combinations need broader proof.
- Global setup and teardown share one persistent coordinator-side Node process,
  and environment changes reach test workers. Arbitrary non-environment global
  object identity is not copied into isolated workers.
- Native TypeScript without a configured transformer is limited to Node's
  erasable syntax; TSX and syntax requiring code generation need a Jest
  transformer.
- The current matrix is deliberately bounded. Unlisted Jest behavior is not a
  compatibility claim.

See the [migration guide](docs/migration-from-jest.md) for the detailed boundary
and keep Jest as the release gate until your own suite produces equivalent
results.

## Verify the evidence locally

```sh
make check
```

The gate runs Rust formatting, Clippy, all workspace tests, JavaScript syntax
and comparator tests, then every semantic fixture against pinned official Jest
30.5.0. The local Jest checkout and real-project corpora live under ignored
`base/`; generated results never inflate the repository.

## Explore

- [Compatibility matrix](docs/compatibility.md)
- [Migration from Jest](docs/migration-from-jest.md)
- [Architecture](docs/architecture.md)
- [Current progress and open work](docs/progress.md)
- [Real-project corpus reports](docs/corpus)
- [Local development](docs/development.md)
- [Architecture decisions](docs/adr)

## Contributing

The most valuable contribution is a minimized Jest/Rjest disagreement backed by
an executable fixture. Reproduce the behavior with official Jest, add it to the
differential matrix, fix Rjest, and keep the regression forever.

If Rjest almost runs your project, open an issue with the smallest reproducible
test and config. Those gaps define the roadmap.

## License

MIT. Rjest is an independent project. Jest attribution is recorded in
[NOTICE.md](NOTICE.md).
