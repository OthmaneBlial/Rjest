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
- Jest-style inline JSON `--config`, with the differential harness now passing
  equivalent canonical roots and Babel transforms to both runners.
- Native transformed ESM execution with `extensionsToTreatAsEsm`, top-level
  await, `@jest/globals`, native-ESM `moduleNameMapper`, and synchronous
  `jest.unstable_mockModule` factories for relative modules, packages, and Node
  built-ins.
- Jest-compatible post-transform Babel/Istanbul instrumentation and source-map
  remapping for transformers such as `ts-jest` that do not instrument output.
- A pinned setup-matlab/Jest 30 corpus: 7/7 suites, 94/94 tests, and exact
  aggregate and per-file coverage parity across nine TypeScript source files.
- A pinned ts-jest/Jest 30 corpus: 20/20 suites, 358/358 tests, and 137/137
  snapshots under both runners, including a 116-test compiler stress suite.
- TypeScript configuration imports, `<rootDir>` discovery patterns,
  `expect.assertions`/`hasAssertions`, object and pretty `test.each` names,
  manual and virtual CommonJS mocks, legacy external snapshot escaping, and
  transformer/test module-cache isolation.
- Weak mock tracking so unreachable mock call graphs can be collected during
  compiler-heavy suites.
- A pinned AWS Amplify JS/Yarn monorepo corpus: the unchanged Analytics package
  passes 30/30 suites and 111/111 tests under Jest 29 and Rjest after the full
  20-package build, with exact aggregate and per-file coverage parity across 58
  instrumented TypeScript files.
- Jest-order `setupFiles`, `workerIdleMemoryLimit` normalization,
  `jest.isolateModules`, inherited/getter-export automocks, live JSDOM storage
  globals, unanchored mapper substitution, and compatible `-w` plus
  `--logHeapUsage` CLI behavior.
- A pinned AWS Amplify Core/Jest 29 corpus: exact 94/94 suites, 632/632 tests,
  2/2 snapshots, and aggregate plus per-file Istanbul parity across 204 source
  files on the unchanged package after the full monorepo build.
- Live JSDOM window/self/navigator and IndexedDB bindings, cycle-safe subset
  matching through inherited accessors, JSDOM initialization isolation from
  mocked global constructors, and Jest-major-aware empty-title result names.
- A pinned AWS Amplify Auth/Jest 29 corpus: exact 101/101 suites, 1,150/1,150
  tests, and aggregate plus per-file Istanbul parity across 198 source files on
  the unchanged package.
- Getter-backed function spies, Jest 29's `jest.genMockFromModule` alias,
  isolated automatic-mock metadata evaluation, and JSDOM isolation from
  Node-only encoding globals.
- A reusable machine comparator for captured real-project results, checking
  exact suite paths, test names/statuses, snapshots, file errors, and aggregate
  plus per-file coverage summaries.
- A pinned AWS Amplify Storage/Jest 29 corpus: exact 85/85 suites, 850/850
  tests, and aggregate plus per-file Istanbul parity across 129 source files on
  the unchanged package.
- Asynchronous custom matcher results with matcher context, asymmetric and
  object `toThrow` expectations, live JSDOM XHR/FileReader/ReadableStream
  aliases, and a separate observable JSDOM `ArrayBuffer` realm.
- A pinned AWS Amplify DataStore/Jest 29 corpus: 33/33 suites, 1,160 passing and
  14 skipped tests, 8/8 snapshots, and aggregate plus per-file Istanbul parity
  across 29 source files on the unchanged package.
- Mutable `expect.getState()`/`setState()` data, the complete fake-indexeddb
  constructor-global surface, and Jest-aligned JSDOM teardown without an extra
  event-loop turn between tests.
- An explicit corpus-comparator policy for randomized skipped-test labels. It
  retains strict executed identities/statuses and per-file skipped counts, with
  automated negative regression tests for both constraints.
- An automated differential denominator containing both passing probes and
  preserved known incompatibilities. The current generated result is 53/53
  compatible scenarios (100%), with per-category scores in the
  machine-readable report. This is a score for the versioned probe corpus, not
  all Jest behavior.

## Current work

- Expand the pinned Amplify monorepo corpus beyond Analytics, Core, Auth,
  Storage, and DataStore, then address the next cross-package
  incompatibilities.

## Compatibility snapshot

`compat/jest-compatibility.json` is regenerated by the differential harness. It
records every scenario, whether Jest/Rjest results match, the observed mismatch,
and category and overall percentages. Known gaps remain executable denominator
entries, so adding a passing-only fixture cannot hide them. The current probe
corpus score is 53/53 (100%). Coverage is 3/3 in that deliberately bounded
scenario category.

## Known blockers

- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.
- Config discovery currently starts at the invocation directory and does not yet
  traverse parent directories like Jest.
- Configured synchronous and implicit `babel-jest` transforms work; async
  transformers, transformer caches, decorators outside the project transformer,
  and TypeScript path aliases remain incomplete.
- Custom resolvers are not implemented; CommonJS and native-ESM
  `moduleNameMapper` rules support the covered mappings, while complete Jest
  resolver conditions and fallback semantics need broader probes.
- Deeply unmocked dependency graphs and ESM module automocking are not
  implemented; manual CommonJS mocks, CommonJS automocking, Babel-hoisted and
  virtual factories, and synchronous ESM module factories are covered by
  differential tests. Async ESM factories remain unsupported.
- New/updated inline snapshot source writes, V8 coverage, non-global threshold
  groups, watch mode, complete custom
  environments, worker reuse, and cooperative cancellation are not implemented.
  Legacy-timer mode remains unimplemented.
- Fresh Node/JSDOM/transformer startup per test file is a major performance
  bottleneck: the pinned Amplify Core serial run is compatible but about 19.35
  times slower than Jest by reported runner time, while Auth is about 19.83
  times slower, Storage is about 14.67 times slower, and DataStore is about
  4.17 times slower.

## Next highest-value tasks

1. Run the next high-impact Amplify workspace package unchanged.
2. Grow the versioned differential denominator from its real failures.
3. Implement legacy fake-timer behavior.
4. Extend native ESM mocking to async factories and unmock/reset semantics.
