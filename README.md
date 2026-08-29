# Rjest

Rjest is an early, independent implementation of a Jest-compatible JavaScript
and TypeScript test runner whose coordinator is written in Rust.

> **Status:** early alpha. JavaScript, configured JSX/TypeScript transforms,
> Node and JSDOM environments, modern fake timers, CommonJS module factories,
> and Jest v1 snapshots now execute through isolated workers. Existing inline
> snapshots and configured snapshot serializers are supported. Global
> automocking, ESM module mocks, writing new inline snapshots,
> `moduleNameMapper`, coverage, watch mode, and many Jest edge cases remain.
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
```

Supported configuration locations include `jest.config.js`, `.cjs`, `.mjs`,
`.ts`, `.cts`, `.mts`, `.json`, and the `jest` field or config reference in
`package.json`. Exported async config functions work. Unknown Jest options fail
explicitly rather than being ignored. Node 22.18 or newer is required; the
current TypeScript path uses Node's native erasable-syntax support and does not
yet handle TSX or TypeScript features that require code generation.

The worker currently delegates ordinary relative, CommonJS, ESM, `main`, and
package `exports` resolution to Node. Configured synchronous Jest transformers
can compile JS, JSX, TS, and TSX before CommonJS execution. Jest-specific
`moduleNameMapper`, custom resolvers, implicit `babel-jest`, and nonstandard
package-manager layouts are not yet covered. For CommonJS,
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

No GitHub-hosted CI is used. See [local development](docs/development.md), the
[compatibility matrix](compat/jest-compatibility.json), current
[progress](docs/progress.md), and the honest [migration status](docs/migration-from-jest.md).

## License

MIT. Jest attribution is recorded in [NOTICE.md](NOTICE.md).
