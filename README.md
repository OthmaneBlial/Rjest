# Rjest

Rjest is an early, independent implementation of a Jest-compatible JavaScript
and TypeScript test runner whose coordinator is written in Rust.

> **Status:** foundation under active development. Native configuration and test
> discovery work; JavaScript test execution is the next milestone. Rjest does not
> claim full or production-ready Jest compatibility.

## Why this architecture?

Rust owns configuration, discovery, scheduling, process management, aggregation,
caching, and reporting. JavaScript tests will execute in isolated Node workers so
that real Node module semantics and ecosystem integrations remain reachable. See
the [architecture](docs/architecture.md) and accepted
[runtime ADR](docs/adr/0001-hybrid-node-runtime.md).

## Try the current milestone

```sh
cargo run -p rjest-cli -- --showConfig
cargo run -p rjest-cli -- --listTests
```

Supported configuration locations are currently `jest.config.json` and the
`jest` field in `package.json`. Unknown Jest options fail explicitly rather than
being ignored.

## Local validation

```sh
make check
```

No GitHub-hosted CI is used. See [local development](docs/development.md), the
[compatibility matrix](compat/jest-compatibility.json), current
[progress](docs/progress.md), and the honest [migration status](docs/migration-from-jest.md).

## License

MIT. Jest attribution is recorded in [NOTICE.md](NOTICE.md).
