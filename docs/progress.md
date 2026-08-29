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
- Native Node resolution verified against Jest for relative CommonJS, ESM
  package self-references/exports, and scoped `node_modules` packages.
- Fifteen semantic differential scenarios in total after module-resolution
  coverage.
- Explicit CommonJS `jest.mock`/`doMock` factories, `requireActual`,
  `requireMock`, recursive basic auto-mocks, module mock generation, and getter,
  setter, and method spies.
- Jest-aligned equality for boxed primitives, URLs, invalid dates, cyclic
  structures, maps, sets, sparse arrays, and strict array comparison.
- Custom matchers through `expect.extend`, including `.not` and promise chains.
- Modern fake timers covering clock control, timeouts, intervals, immediates,
  tick/microtask queues, async advancement, `Date`, `performance`, and `hrtime`.
- Configured Jest transformer execution for JavaScript, JSX, TypeScript, and
  TSX, plus `setupFilesAfterEnv`, JSDOM, snapshot serializers, and Jest's
  `NODE_ENV=test` default.
- Module-scoped CommonJS mock resolution through transformed modules and
  `@jest/globals` interception.
- Existing inline and thrown-error inline snapshot matching with snapshot-count
  parity, plus worker wall-clock termination for a blocked event loop.
- A pinned Downshift real-project corpus: exact discovery and 92/92 passing
  suites, 1,110/1,110 passing tests, and 49/49 matching snapshots under both
  official Jest and Rjest.
- A locked React Select/Jest 25 corpus: exact discovery and 5/5 passing suites,
  255 passing tests, 3 skipped tests, and 5/5 Emotion snapshots under both
  official Jest and Rjest.
- Historical pre-Jest-27 JSDOM defaults, implicit `babel-jest`, legacy
  four-argument transformers, legacy Pretty Format, and modern `serialize()`
  snapshot plugins.
- Babel/Istanbul coverage instrumentation with cross-worker counter merging,
  positive and negated `collectCoverageFrom` globs, coverage path ignores,
  JSON, JSON-summary, text, text-summary, LCOV/HTML, and Clover reporters, and
  global positive/negative threshold enforcement.
- Exact React Select coverage parity across 39 files: 1,064/1,438 statements,
  659/1,054 branches, 251/312 functions, and 1,033/1,363 lines.
- Ordered `moduleNameMapper` rules for CommonJS and transformed modules,
  including capture substitution, fallback targets, `require.resolve`, and
  shared mapped identity for explicit Jest mocks.
- Modern animation-frame scheduling and `advanceTimersToNextFrame`, including
  JSDOM callbacks, cancellation, intermediate timers, and frame timestamps.
- External and existing inline snapshot property matchers with deep object and
  array merging and Jest-compatible asymmetric serialization.
- Configured and runtime CommonJS automocking with recursive exports, classes,
  built-in exemptions, explicit factories/unmocking, Babel hoisting, and
  transform-tooling isolation.
- An automated differential denominator containing both passing probes and
  preserved known incompatibilities. The current generated result is 36/37
  compatible scenarios (97.297%), with per-category scores in the
  machine-readable report. This is a score for the versioned probe corpus, not
  all Jest behavior.

## Current work

- Close the remaining TypeScript enum transform probe, then add Node/ESM and
  monorepo corpora with original Jest configurations.

## Compatibility snapshot

`compat/jest-compatibility.json` is regenerated by the differential harness. It
records every scenario, whether Jest/Rjest results match, the observed mismatch,
and category and overall percentages. Known gaps remain executable denominator
entries, so adding a passing-only fixture cannot hide them. The current probe
corpus score is 36/37 (97.297%). Coverage is 2/2 in that deliberately bounded
scenario category.

## Known blockers

- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.
- Config discovery currently starts at the invocation directory and does not yet
  traverse parent directories like Jest; CLI JSON config strings are also absent.
- Configured synchronous and implicit `babel-jest` transforms work; async
  transformers, transformer caches, decorators outside the project transformer,
  and TypeScript path aliases remain incomplete.
- Native-ESM module-name mapping and custom resolvers are not implemented;
  CommonJS and transformed `moduleNameMapper` rules support ordered fallbacks.
- Manual `__mocks__` lookup, deeply unmocked dependency graphs, and ESM module
  mocking are not implemented; CommonJS automocking and Babel-hoisted explicit
  factories are covered by differential tests.
- New/updated inline snapshot source writes, V8 coverage, non-global threshold
  groups, watch mode, complete custom
  environments, worker reuse, and cooperative cancellation are not implemented.
  Legacy-timer mode remains unimplemented.

## Next highest-value tasks

1. Close the remaining TypeScript enum transform probe.
2. Add Node, ESM, and monorepo corpora with nontrivial Jest configuration.
3. Implement legacy fake-timer behavior.
4. Extend `moduleNameMapper` and module mocking to native ESM.
