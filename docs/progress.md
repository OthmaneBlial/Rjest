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
- Versioned and validated Rust/Node worker protocol with a fresh isolated process
  per test file.
- Jest-style `describe`, `test`, `it`, nested hooks, sync/promise/callback tests,
  timeouts, focus, skip, and todo behavior.
- Common matchers, `.not`, `.resolves`, `.rejects`, asymmetric matchers, basic
  `jest.fn`, and method `jest.spyOn` support.
- Native execution of JavaScript, ESM, and erasable TypeScript on Node 22.18+.
- Bounded parallel file scheduling with deterministic path-ordered aggregation.
- Default and JSON reporters with deliberate Jest-style success/failure codes.
- Initial semantic differential coverage for passing suites, assertion failures,
  focus, and timeouts against official Jest 30.5.0.
- Safe external Jest v1 snapshot parsing and Rust-owned persistence without
  evaluating `.snap` files as JavaScript.
- Common-value snapshot serialization, existing/missing snapshot behavior,
  mismatch failures, update mode, natural key sorting, and obsolete removal.
- Eight semantic differential scenarios in total, including byte-for-byte
  comparison of consumed, newly generated, mismatched, and updated snapshots.
- Jest-order discovery and Node evaluation of JS, CJS, MJS, TS, CTS, and MTS
  configuration, including async exported functions and package references.
- Strict JSON-compatible config handoff with multiple-config detection and
  normalized `testTimeout`, Node environment, and `maxWorkers` propagation.
- Twelve semantic differential scenarios in total after executable config
  coverage for ESM, CommonJS, TypeScript, and package references.

## Current work

- Node CommonJS/ESM/package resolution fixtures and resolver compatibility.

## Compatibility snapshot

| Area | Status | Executable cases |
| --- | --- | ---: |
| CLI | partial | 5/5 |
| Config | partial | 7/7 |
| Discovery | partial | 3/3 |
| Core test API | partial | 4/4 |
| Assertions | partial | 3/3 |
| Mocks | partial | 2/2 |
| Snapshots | partial | 4/4 |
| Transform / ESM / workers | partial | 3/3 |

The Jest/Rjest differential harness passes 12/12 current scenarios; the Rust
suite contains 18 local tests.

This table describes implemented cases, not percentage compatibility with all of
Jest.

## Known blockers

- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.
- Config discovery currently starts at the invocation directory and does not yet
  traverse parent directories like Jest; CLI JSON config strings are also absent.
- TypeScript support is currently limited to Node's erasable syntax; TSX,
  decorators requiring transformation, and path aliases are not transformed.
- Inline snapshots, snapshot property matchers/custom serializers, module
  mocking, fake timers, coverage, watch mode, jsdom, worker reuse, and cooperative
  cancellation are not implemented.

## Next highest-value tasks

1. Add Node package resolution fixtures and CommonJS/ESM module-import coverage.
2. Implement `moduleDirectories` and `moduleNameMapper` without diverging from
   Node/Jest resolution semantics.
3. Expand matcher and mock differential cases, then add module mocking.
4. Add inline snapshots only after a source-rewrite design is proven safe.
