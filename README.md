# Rjest

Rjest is an early, independent implementation of a Jest-compatible JavaScript
and TypeScript test runner whose coordinator is written in Rust.

> **Status:** early alpha. JavaScript, configured JSX/TypeScript transforms,
> Node and JSDOM environments, modern and legacy fake timers, CommonJS module
> factories, and Jest v1 snapshots now execute through isolated workers. Existing inline
> snapshots, snapshot property matchers, configured serializers,
> Babel/Istanbul coverage, and CommonJS/transformed `moduleNameMapper` rules are
> supported. CommonJS and native-ESM automocking, manual CommonJS/native-ESM
> `__mocks__` resolution,
> Babel-hoisted and virtual mock factories, native-ESM mapping, and direct
> synchronous or asynchronous ESM module mocks also work. New and updated
> inline snapshots can rewrite JavaScript, TypeScript, CommonJS, and native ESM
> callsites, including whole-file formatting and snapshot indentation through a
> project's configured Prettier 2 or 3. V8 coverage, watch mode, and
> many Jest edge cases remain.
> Rjest does not claim full or production-ready Jest compatibility.

## Why this architecture?

Rust owns configuration, discovery, scheduling, process management, aggregation,
and reporting. JavaScript tests execute in isolated Node workers so that real
Node module semantics and ecosystem integrations remain reachable. See
the [architecture](docs/architecture.md) and accepted
[runtime ADR](docs/adr/0001-hybrid-node-runtime.md).

## Try the current milestone

```sh
cargo run -p rjest-cli -- --showConfig
cargo run -p rjest-cli -- --listTests
cargo run -p rjest-cli -- --runInBand
cargo run -p rjest-cli -- --maxWorkers=50% --testNamePattern=calculator
cargo run -p rjest-cli -- --updateSnapshot
cargo run -p rjest-cli -- --coverage
cargo run -p rjest-cli -- --seed=1234 --showSeed
cargo run -p rjest-cli -- --randomize --seed=1234
cargo run -p rjest-cli -- --shard=1/3
cargo run -p rjest-cli -- --bail
```

Supported configuration locations include `jest.config.js`, `.cjs`, `.mjs`,
`.ts`, `.cts`, `.mts`, `.json`, and the `jest` field or config reference in
`package.json`. Jest-style inline JSON passed through `--config` also works.
Exported async config functions and supported `fakeTimers` options work. Unknown
Jest options fail explicitly rather than being ignored. Node 22.18 or newer is
required; the current TypeScript path uses Node's native erasable-syntax support
and does not yet handle TSX or TypeScript features that require code generation.

The worker currently delegates ordinary relative, CommonJS, ESM, `main`, and
package `exports` resolution to Node. Configured Jest transformers can compile
JS, JSX, TS, and TSX before execution. Native ESM imports prefer `processAsync`
when available, await asynchronous transformer factories (including ESM
transformer modules), and prepare transformed static and dynamic graphs before
Node's synchronous loader hook consumes them. Ordered
`moduleNameMapper` rules support capture substitution and fallback targets for
CommonJS, transformed modules, and the covered native-ESM paths. Custom
resolvers and nonstandard package-manager layouts are not yet covered. When no
transform is configured, Rjest resolves the Babel-Jest version bundled with the
project's installed Jest before falling back to a direct project dependency.
For CommonJS, `jest.mock`/`doMock` factories, manual and virtual mocks,
`requireActual`, `requireMock`, and recursive basic auto-mocks are available;
transformed modules retain the declaring-file context used to resolve mocks.

## Local validation

```sh
make check
```

The local gate runs formatting, Clippy, Rust unit/integration tests, JavaScript
syntax checks, and semantic differential scenarios against official Jest 30.5.0.
The generated score includes versioned known-incompatible probes in its
denominator and states its limited corpus scope; it is not an estimate of the
percentage of the complete Jest API.

A pinned Downshift corpus provides a separate real-project proof: official Jest
and Rjest both pass 92/92 suites, 1,110/1,110 tests, and 49/49 snapshot
assertions on the recorded dependency tree. The ignored corpus artifacts and
commands are intentionally separate from the versioned probe percentage. See
the [Downshift corpus report](docs/corpus/downshift.md).

The pinned [React Select corpus](docs/corpus/react-select.md) separately reaches
5/5 suites, 255 passing and 3 skipped tests, and 5/5 Emotion snapshots under
Jest 25. Its original `--coverage` command now runs unchanged; Jest and Rjest
also agree exactly on the 39-file Istanbul summary and all statement, branch,
function, and line totals.

The pinned [setup-matlab corpus](docs/corpus/setup-matlab.md) adds native ESM,
`ts-jest`, top-level await, and ESM module mocks. Official Jest and Rjest both
pass 7/7 suites and 94/94 tests with identical coverage summaries across nine
TypeScript source files.

The pinned [ts-jest corpus](docs/corpus/ts-jest.md) exercises a large TypeScript
transformer unit suite, executable TypeScript configuration, parameterized
snapshot names, virtual/manual mocks, and compiler-heavy memory behavior.
Official Jest and Rjest both pass 20/20 suites, 358/358 tests, and 137/137
snapshots on the untouched checkout.

The pinned [AWS Amplify Analytics corpus](docs/corpus/amplify-analytics.md)
exercises an unchanged Yarn monorepo package after the repository's complete
production build. Jest 29 and Rjest both pass 30/30 suites and 111/111 tests,
with exact aggregate and per-file coverage-summary parity across 58 source
files.

The pinned [AWS Amplify Core corpus](docs/corpus/amplify-core.md) expands the
same unchanged monorepo proof to 94/94 suites, 632/632 tests, and 2/2 snapshots.
Its strict comparison also finds exact test identity/status and aggregate plus
per-file coverage parity across 204 source files. Rjest remains materially
slower on this transformer-heavy workload.

The pinned [AWS Amplify Auth corpus](docs/corpus/amplify-auth.md) extends the
unchanged monorepo proof to 101/101 suites and 1,150/1,150 tests. Its automated
comparison finds exact suite paths, test identities/statuses, and aggregate plus
per-file coverage parity across 198 source files, with zero Rjest file errors.

The pinned [AWS Amplify Storage corpus](docs/corpus/amplify-storage.md) adds
85/85 suites and 850/850 tests from the unchanged package. Jest and Rjest agree
on every test identity/status and every Istanbul summary across 129 source
files after exercising async custom matchers, XHR mocks, and cross-realm data.

The pinned [AWS Amplify DataStore corpus](docs/corpus/amplify-datastore.md)
adds fake IndexedDB, Dexie, RxJS scheduling, TSX type tests, and expectation
state. Both runners discover 33 suites and 1,174 tests, pass 1,160 with 14
skipped, match 8 snapshots, and agree on every Istanbul summary across 29
source files. Executed identities are exact; 12 skipped fuzz labels are random
and are compared by an explicit per-file count policy.

The pinned [AWS Amplify Notifications corpus](docs/corpus/amplify-notifications.md)
adds 61 suites and 261 tests covering native/mobile branches, event listeners,
signed requests, and per-file environment docblocks. Jest and Rjest agree on
every test identity/status and every Istanbul summary across 90 source files.

The pinned [AWS Amplify Adapter Next.js corpus](docs/corpus/amplify-adapter-nextjs.md)
adds a mock-dense Node/Next.js server workload. Both runners pass 41/41 suites,
300 tests with one skipped test, and one snapshot, with exact coverage summaries
across 50 source files.

The pinned [AWS Amplify API REST corpus](docs/corpus/amplify-api-rest.md) adds
request signing, cancellation, response parsing, factory mocks, and timeout
spies. Both runners pass 10/10 suites and 208/208 tests, with exact aggregate
and per-file coverage summaries across 24 source files.

The pinned [aggregate AWS Amplify API corpus](docs/corpus/amplify-api.md)
composes GraphQL, Adapter Next.js, SSR, fetch mocks, and package exports. Both
runners pass 2/2 suites and 86/86 tests with exact test identities/statuses.

The pinned [AWS Amplify PubSub corpus](docs/corpus/amplify-pubsub.md) covers
MQTT-over-WebSocket reconnection, network recovery, Observables, topic
wildcards, and vendored JavaScript. Both runners pass 17/17 tests and match all
coverage summaries across 14 files.

The pinned [AWS Amplify Interactions corpus](docs/corpus/amplify-interactions.md)
covers Lex V1/V2 clients, JSDOM blobs, automatic mocks, and asynchronous
compression in eval-based Node worker threads. Both runners pass 30/30 tests
and match every coverage summary across 19 files.

The pinned [AWS Amplify React Native corpus](docs/corpus/amplify-react-native.md)
covers platform/native-module facades, dynamic loaders, `doMock`, and
`resetModules`. Both runners pass 29/29 tests and, when coverage is requested,
match every summary across 19 files and the package's threshold exit code.

No GitHub-hosted CI is used. See [local development](docs/development.md), the
[compatibility matrix](compat/jest-compatibility.json), current
[progress](docs/progress.md), and the honest [migration status](docs/migration-from-jest.md).

## License

MIT. Jest attribution is recorded in [NOTICE.md](NOTICE.md).
