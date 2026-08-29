# Rjest

Rjest is an early, independent implementation of a Jest-compatible JavaScript
and TypeScript test runner whose coordinator is written in Rust.

> **Status:** early alpha. Real JavaScript and erasable TypeScript tests execute
> with nested suites, hooks, async behavior, common assertions, basic mocks, and
> bounded parallel files. Jest v1 external snapshots can be consumed, created,
> and updated. Module mocks, inline snapshots, TSX transforms, watch mode, and
> many Jest edge cases are not implemented. Rjest does not claim full or
> production-ready Jest compatibility.

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

Supported configuration locations are currently `jest.config.json` and the
`jest` field in `package.json`. Unknown Jest options fail explicitly rather than
being ignored. Node 22.18 or newer is required; the current TypeScript path uses
Node's native erasable-syntax support and does not yet handle TSX or TypeScript
features that require code generation.

## Local validation

```sh
make check
```

The local gate runs formatting, Clippy, Rust unit/integration tests, JavaScript
syntax checks, and semantic differential scenarios against official Jest 30.5.0.

No GitHub-hosted CI is used. See [local development](docs/development.md), the
[compatibility matrix](compat/jest-compatibility.json), current
[progress](docs/progress.md), and the honest [migration status](docs/migration-from-jest.md).

## License

MIT. Jest attribution is recorded in [NOTICE.md](NOTICE.md).
