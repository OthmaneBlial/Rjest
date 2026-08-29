# Progress

Last updated: 2026-08-29

## Completed

- Rust workspace and a reproducible `make check` local quality gate.
- Official Jest checkout pinned locally under ignored `base/jest`.
- ADR selecting a Rust coordinator with bounded, isolated Node workers.
- JSON and `package.json` configuration loading with strict unsupported-option
  errors.
- Native test discovery with Jest default suffixes, roots, regexes, ignore
  patterns, explicit paths, and deterministic ordering.
- Machine-readable compatibility matrix tied to executable test counts.

## Current work

- Versioned Rust/Node worker protocol and first real JavaScript test execution.

## Compatibility snapshot

| Area | Status | Executable cases |
| --- | --- | ---: |
| CLI | partial | 2/2 |
| Config | partial | 3/3 |
| Discovery | partial | 3/3 |
| Execution and remaining areas | planned | 0 |

This table describes implemented cases, not percentage compatibility with all of
Jest.

## Known blockers

- JavaScript/TypeScript configuration needs the Node runtime bridge.
- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.

## Next highest-value tasks

1. Define and validate the worker protocol.
2. Execute JavaScript test files with `describe`, `test`, `it`, hooks, and async
   timeouts.
3. Implement foundational `expect` matchers and differential fixtures.
4. Add bounded parallel file execution and deterministic reporting.
