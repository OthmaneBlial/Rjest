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
- Legacy fake timers with a persistent zero-based scheduler, Jest-mock timer
  functions, Node and JSDOM handles, native wall-clock APIs, ticks/immediates,
  animation frames, pending-timer semantics, and legacy-specific API errors.
- Jest `fakeTimers` configuration normalization and worker propagation for
  globally enabled modern/legacy modes, `doNotFake`, `now`, and `timerLimit`,
  including activation before `setupFilesAfterEnv`.
- Modern `fakeTimers.advanceTimers` and explicit `advanceTimers` options backed
  by a native, teardown-safe clock driver, including Jest's 20 ms boolean default
  and numeric advancement cadence.
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
  await, `@jest/globals`, native-ESM `moduleNameMapper`, and direct synchronous
  or asynchronous `jest.unstable_mockModule` factories for relative modules,
  packages, and Node built-ins. Differential coverage preserves successful
  caching, rejected-factory retries, concurrent first imports, exotic export
  names, import attributes, conditional package exports, transformed static
  dependency graphs, re-exports, unused-factory laziness, parent-aware
  `unstable_unmockModule`, fresh actual/mock registries after `resetModules`,
  and asynchronous CommonJS/ESM registry isolation with error-safe restoration.
- Jest-compatible post-transform Babel/Istanbul instrumentation and source-map
  remapping for transformers such as `ts-jest` that do not instrument output.
- Async native-ESM graph preparation for processAsync-only transformer modules,
  including top-level await, async factories, transformed re-exports and
  injected dependencies, dynamic imports, in-flight caching, and coverage.
- Native-ESM automocking from scratch-registry metadata for static, dynamic,
  relative, and package imports, including default/named/class/nested/array
  exports, explicit unmock/factory precedence, reset, and async isolation.
- Native-ESM manual mocks with Jest-order root and sibling lookup, authored
  exports, generated dependencies in scratch registries, unresolvable bare
  names, explicit unmocking, reset, and async isolation.
- Ordered, deduplicated `jest.onGenerateMock` callbacks for explicit mock
  generation and CommonJS/native-ESM automocking, including replacement values,
  reset regeneration, and manual/explicit-factory exemptions.
- Parent-aware CommonJS `jest.deepUnmock` propagation through nested and cyclic
  graphs, with reset persistence, shallow-unmock separation, direct-import
  remocking, and explicit-factory priority.
- `jest.replaceProperty` with prototype-chain lookup, repeated replacement
  handles, number/symbol keys, Jest-aligned descriptor errors, idempotent manual
  restoration, and shared `restoreAllMocks` cleanup with spies.
- Strict `restoreMocks` configuration propagated through worker protocol v11,
  restoring setup- and test-created spies/properties before the first and every
  later user `beforeEach` while preserving standalone mock-function state.
- Strict `resetMocks` configuration in grouped lifecycle state and worker
  protocol v12, clearing setup/test mock calls and implementations before every
  user hook while retaining property replacements and reinstalling configured
  legacy fake-timer mock APIs without dropping pending timers.
- Strict `resetModules` configuration in worker protocol v13, clearing
  setup-loaded and per-test CommonJS instances, refreshing retained factory
  mock values, and advancing native ESM registry generations before every test.
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
- A pinned AWS Amplify Notifications/Jest 29 corpus: exact 61/61 suites,
  261/261 tests, and aggregate plus per-file Istanbul parity across 90 source
  files on the unchanged package.
- Jest test-file `@jest-environment` overrides and merged JSON
  `@jest-environment-options`, preserved by a three-file official-Jest
  differential scenario.
- A pinned AWS Amplify Adapter Next.js/Jest 29 corpus: exact 41/41 suites, 300
  passing and one skipped test, one snapshot, and aggregate plus per-file
  Istanbul parity across 50 source files on the unchanged package.
- A pinned AWS Amplify API REST/Jest 29 corpus: exact 10/10 suites, 208/208
  tests, and aggregate plus per-file Istanbul parity across 24 source files on
  the unchanged package.
- A pinned aggregate AWS Amplify API/Jest 29 corpus: exact 2/2 suites and 86/86
  tests on unchanged SSR, GraphQL, Adapter Next.js, and package-export behavior.
  Both runners produce the package's expected empty Istanbul coverage map.
- A pinned AWS Amplify PubSub/Jest 29 corpus: exact 1/1 suite, 17/17 tests, and
  aggregate plus per-file Istanbul parity across 14 source files, including
  MQTT-over-WebSocket reconnection and the vendored Paho MQTT runtime.
- Jest-compatible nested Node worker startup: Rjest's embedded ESM worker launch
  no longer leaks module input mode through `process.execArgv` into user-created
  `{ eval: true }` workers.
- A pinned AWS Amplify Interactions/Jest 29 corpus: exact 8/8 suites, 30/30
  tests, and aggregate plus per-file Istanbul parity across 19 source files,
  including real asynchronous `fflate` compression workers and Lex V1/V2 SDK
  clients.
- A pinned AWS Amplify React Native/Jest 29 corpus: exact 4/4 suites and 29/29
  tests in the original no-coverage mode, plus aggregate and per-file Istanbul
  parity across 19 source files and the same configured-threshold exit code
  when coverage is explicitly enabled.
- Jest-aligned mock arity, call contexts/instances, recursive result finalization,
  undefined one-shot fallback behavior, repeated-spy identity, and restoration
  across inherited prototype methods.
- An automated differential denominator containing both passing probes and
  preserved known incompatibilities. The current generated result is 76/77
  compatible scenarios (98.7%), with ESM at 7/7 (100.0%), transforms at 5/5
  (100.0%), mocks at 12/13 (92.3%), configuration at 16/16 (100.0%), and
  per-category scores in the machine-readable report. This is a score for the
  versioned probe corpus, not all Jest behavior.

## Current work

- The unchanged Amplify API GraphQL package matches 8/8 suites, 149/149 tests,
  and 15/15 snapshots. Its strict full-corpus result remains open because a
  leaked one-second WebSocket cleanup timer lands on a wall-clock boundary:
  repeated official full runs record one or two hits, while official Jest
  records zero when the unchanged 42-test contributing file runs alone. Rjest
  is short by 2 covered statements, 1 branch, and 2 lines in one of 36 files.
  No artificial wait or comparator relaxation has been added for this
  timing-dependent signal.

## Compatibility snapshot

`compat/jest-compatibility.json` is regenerated by the differential harness. It
records every scenario, whether Jest/Rjest results match, the observed mismatch,
and category and overall percentages. Known gaps remain executable denominator
entries, so adding a passing-only fixture cannot hide them. The current probe
corpus score is 76/77 (98.7%). ESM is 7/7 (100.0%), transforms are 5/5
(100.0%), mocks are 12/13 (92.3%), configuration is 16/16 (100.0%), and
coverage is 3/3 in their bounded scenario categories.

## Known blockers

- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.
- Config discovery currently starts at the invocation directory and does not yet
  traverse parent directories like Jest.
- Configured synchronous, processAsync-only, and implicit `babel-jest`
  transforms work. Async ESM transformer modules/factories, injected static
  dependencies, dynamic imports, and coverage are differential-tested.
  Transformer cache-key persistence, decorators outside the project transformer,
  and TypeScript path aliases remain incomplete.
- Custom resolvers are not implemented; CommonJS and native-ESM
  `moduleNameMapper` rules support the covered mappings, while complete Jest
  resolver conditions and fallback semantics need broader probes.
- `jest.setMock` is not implemented. Manual CommonJS/native-ESM
  mocks, CommonJS/native-ESM automocking, transitive CommonJS unmocking,
  property replacement, Babel-hoisted and virtual factories, and
  direct/transitive synchronous or asynchronous ESM module factories are
  covered by differential tests. ESM unmock/reset behavior and asynchronous
  CommonJS/ESM isolated registries are covered.
- New/updated inline snapshot source writes, V8 coverage, non-global threshold
  groups, watch mode, complete custom
  environments, worker reuse, and cooperative cancellation are not implemented.
- Fresh Node/JSDOM/transformer startup per test file is a major performance
  bottleneck: the pinned Amplify Core serial run is compatible but about 19.35
  times slower than Jest by reported runner time, while Auth is about 19.83
  times slower, Storage is about 14.67 times slower, and DataStore is about
  4.17 times slower. Notifications is about 29.95 times slower and Adapter
  Next.js is about 35.78 times slower. API REST is about 6.32 times slower and
  the aggregate API package is about 9.92 times slower. PubSub is about 2.20
  times slower, Interactions is about 13.10 times slower, and React Native is
  about 4.54 times slower in the ordinary no-coverage mode.

## Next highest-value tasks

1. Run the next high-impact Amplify workspace package unchanged.
2. Grow the versioned differential denominator from deterministic real-project
   failures.
3. Implement explicit CommonJS `jest.setMock` exports.
4. Add broader timer edge-case probes and modern timer tick-mode controls.
5. Replace per-file Node/JSDOM/transformer startup after correctness remains
   stable across a broader independent corpus.
