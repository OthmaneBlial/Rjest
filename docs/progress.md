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
- Four semantic differential scenarios against official Jest 30.5.0, covering
  passing suites, assertion failures, focus, and timeouts.

## Current work

- Jest-compatible snapshot persistence and update behavior.

## Compatibility snapshot

| Area | Status | Executable cases |
| --- | --- | ---: |
| CLI | partial | 4/4 |
| Config | partial | 3/3 |
| Discovery | partial | 3/3 |
| Core test API | partial | 4/4 |
| Assertions | partial | 3/3 |
| Mocks | partial | 2/2 |
| Transform / ESM / workers | partial | 3/3 |

The Jest/Rjest differential harness passes 4/4 current scenarios; the Rust suite
contains 13 local tests.

This table describes implemented cases, not percentage compatibility with all of
Jest.

## Known blockers

- JavaScript/TypeScript configuration needs the Node runtime bridge.
- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.
- TypeScript support is currently limited to Node's erasable syntax; TSX,
  decorators requiring transformation, and path aliases are not transformed.
- Module mocking, snapshots, fake timers, coverage, watch mode, jsdom, worker
  reuse, and cooperative cancellation are not implemented.

## Next highest-value tasks

1. Implement Jest-compatible external snapshot parsing, persistence, update
   mode, obsolete detection, and differential fixtures.
2. Load JavaScript/CJS/MJS/TypeScript Jest configuration through a constrained
   Node bridge while continuing to reject unsupported fields.
3. Add Node package resolution fixtures and CommonJS/ESM module-import coverage.
4. Expand matcher and mock differential cases, then add module mocking.
