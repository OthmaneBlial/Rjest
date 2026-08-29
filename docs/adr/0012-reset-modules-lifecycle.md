# ADR 0012: Reset module registries before user test setup

- Status: accepted
- Date: 2026-08-29

## Context

Jest's `resetModules` configuration resets module registries before every test,
before configured mock clearing/reset/restoration and before user `beforeEach`
hooks. Modules loaded by `setupFilesAfterEnv` are therefore evicted before the
first test. Explicit factory decisions survive, but their evaluated values are
fresh. Native ESM imports must receive a new registry generation as well.

## Decision

Add strict `resetModules` normalization with a `false` default, propagate it
through CLI runner options, and add it to worker protocol v13. Invoke the
existing unified `jest.resetModules()` implementation at the start of each
selected test's internal setup, ahead of all mock lifecycle options.

Use the same reset path already differential-tested for explicit calls so
CommonJS caches, generated/explicit mock instances, native ESM URLs, and ESM
mock overlays remain consistent.

## Consequences

- Setup-loaded CommonJS modules are fresh before the first test.
- Actual and mocked CommonJS instances are fresh before every test while mock
  registrations and factories remain available.
- Dynamic native ESM imports receive fresh namespaces per test.
- Reset ordering composes with `clearMocks`, `resetMocks`, and `restoreMocks` in
  Jest adapter order.
- Config serialization and the embedded worker agree on protocol version 13.
