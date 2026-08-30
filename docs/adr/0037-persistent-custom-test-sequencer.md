# ADR 0037: Bridge custom Jest test sequencers as persistent sessions

- Status: accepted
- Date: 2026-08-30

## Context

Jest loads one configured `testSequencer` class for the complete selected
project matrix. The instance receives all project contexts and global options,
optionally shards the combined test list, sorts it, and later receives the
execution aggregate through `cacheResults`. Shard and sort hooks may be async,
and custom classes commonly inherit cache behavior from
`@jest/test-sequencer`.

Rjest previously rejected the configuration field and always used its native
default shard/order paths. A seed-aware reverse-order fixture therefore wrote
`cba` under Jest while Rjest exited before executing any file.

## Decision

Normalize configured path and bare-module sequencer references and start a
dedicated Node bridge before scheduling. Build Jest-shaped contexts containing
each project root, display name, a minimal Haste filesystem view, and stable
performance-cache coordinates. Preserve opaque integer identity for every test
and project-context pair.

Instantiate CommonJS or native-ESM sequencer classes once. Await optional
`shard` before required `sort`, validate that returned tests came from the input
matrix, and when `onlyFailures` is enabled await required `allFailedTests` after
sorting. Rebuild adjacent Rust project runs without losing ownership. Keep the
bridge process alive until execution ends, then call `cacheResults` on the same
instance with a Jest-shaped aggregate. Close without caching for list-only,
empty, or threshold-bailed runs, following Jest's observed CLI control flow.

Accept Jest's `--testSequencer` CLI option and normalize its path from the
selected project root after configuration loading. The CLI-selected module
replaces the configured class before discovery and session startup.

## Consequences

- Seed-sensitive custom ordering is observable under serial execution.
- Custom shard implementations replace the default SHA-1 shard selection and
  still run before sort.
- CommonJS, native ESM, synchronous, and asynchronous hooks are supported.
- Synchronous or asynchronous `allFailedTests` selection runs after shard and
  sort under `--onlyFailures`/`-f`.
- CLI override precedence is marker-tested with a class whose order and cache
  output differ from the configured sequencer.
- Classes inheriting `@jest/test-sequencer` can use size sorting and persist
  failure/duration data through the supplied cache coordinates.
- Duplicate physical paths in separate projects retain distinct identities.
- Malformed results, missing hooks, module-load failures, and cache failures
  become explicit coordinator errors; no shell is involved.
- Configured synchronous CommonJS and top-level-await ESM resolvers now
  participate in sequencer lookup as recorded in ADR 0040.
