# ADR 0010: Restore mocks before user test setup

- Status: accepted
- Date: 2026-08-29

## Context

Jest's `restoreMocks` configuration is equivalent to calling
`jest.restoreAllMocks()` before every test. Its internal lifecycle hook is
registered before `setupFilesAfterEnv`, so spies and property replacements
created during setup are restored before the first test. The restoration also
runs before user `beforeEach` hooks and must not reset standalone `jest.fn`
state.

Rjest rejects unknown configuration fields rather than silently ignoring them,
and worker requests are versioned. Supporting this option therefore requires a
normalized configuration field and protocol change, not a worker-only shortcut.

## Decision

Add `restoreMocks` to strict project configuration with a `false` default,
propagate it through CLI runner options, and add it to worker protocol v11. In
the worker's per-test setup, invoke `restoreAllMocks` after configured
`clearMocks` and before user hooks, matching Jest adapter ordering.

Use the existing shared spy/property restoration registry. Do not clear or
reset ordinary mock functions during automatic restoration.

## Consequences

- Setup-created spies and replacements are restored before the first test.
- Test-created spies and replacements are restored before the next test and
  before its user `beforeEach` hooks.
- Standalone mock calls and implementations survive when only `restoreMocks` is
  enabled.
- Config serialization, CLI execution, and the embedded worker agree on
  protocol version 11.
