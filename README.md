# Rjest

Rjest is an early, independent implementation of a Jest-compatible JavaScript
and TypeScript test runner whose coordinator is written in Rust.

> **Status:** early alpha. JavaScript, configured JSX/TypeScript transforms,
> Node and JSDOM environments, modern fake timers, CommonJS module factories,
> and Jest v1 snapshots now execute through isolated workers. Existing inline
> snapshots, snapshot property matchers, configured serializers,
> Babel/Istanbul coverage, and CommonJS/transformed `moduleNameMapper` rules are
> supported. CommonJS automocking and Babel-hoisted mock factories also work.
> Manual `__mocks__` resolution, ESM module mocks, writing new inline snapshots,
> native-ESM mapping, V8 coverage, watch mode, and many Jest edge cases remain.
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
```

Supported configuration locations include `jest.config.js`, `.cjs`, `.mjs`,
`.ts`, `.cts`, `.mts`, `.json`, and the `jest` field or config reference in
`package.json`. Jest-style inline JSON passed through `--config` also works.
Exported async config functions work. Unknown Jest options fail explicitly
rather than being ignored. Node 22.18 or newer is required; the
current TypeScript path uses Node's native erasable-syntax support and does not
yet handle TSX or TypeScript features that require code generation.

The worker currently delegates ordinary relative, CommonJS, ESM, `main`, and
package `exports` resolution to Node. Configured synchronous Jest transformers
can compile JS, JSX, TS, and TSX before CommonJS execution. Ordered
`moduleNameMapper` rules support capture substitution and fallback targets for
CommonJS and transformed modules. Native-ESM mapping, custom resolvers, and
nonstandard package-manager layouts are not yet covered. When no transform is
configured, Rjest resolves the Babel-Jest version bundled with the project's
installed Jest before falling back to a direct project dependency. For CommonJS,
`jest.mock`/`doMock` factories, `requireActual`, `requireMock`, and recursive
basic auto-mocks are available; transformed modules retain the declaring-file
context used to resolve mocks.

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

No GitHub-hosted CI is used. See [local development](docs/development.md), the
[compatibility matrix](compat/jest-compatibility.json), current
[progress](docs/progress.md), and the honest [migration status](docs/migration-from-jest.md).

## License

MIT. Jest attribution is recorded in [NOTICE.md](NOTICE.md).
