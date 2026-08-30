# Progress

Last updated: 2026-08-30

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
- Explicit CommonJS `jest.setMock` exports with global/scoped caller-relative
  resolution, supplied object or primitive identity, prior-factory replacement,
  persistence across module resets, and later explicit unmocking.
- Jest Circus-compatible per-test retry scheduling with deferred and immediate
  modes, hook/lifecycle reruns, real-timer waits, retry reasons, invocation
  counts, and per-attempt snapshot rollback. Worker protocol v14 carries the
  retry metadata into JSON and the default reporter.
- Jest 30 whole-describe retries across `beforeAll`, descendant tests and
  `afterAll`, including local boundaries, nested composition, snapshot rollback,
  and non-retryable ancestor, process-level, and `afterAll`-only errors.
- A coordinator-owned signed 32-bit run seed in worker protocol v15, exposed by
  `jest.getSeed`, validated through `--seed`, generated when omitted, and shown
  on demand through `--showSeed`.
- Seeded per-file Jest Circus randomization in worker protocol v16, using
  xoroshiro128plus-compatible bounded draws and Jest's forward Fisher-Yates
  shuffle at each describe lifecycle boundary. CLI/config activation, automatic
  seed reporting, nested suites, and stable whole-describe retry ordering are
  differentially covered.
- Jest-compatible `--shard=n/m` parsing and coordinator-side selection using
  the SHA-1 of each root-relative POSIX test path, including balanced uneven
  partitions, identity shards, list-mode empty shards, and selection before
  parallel scheduling.
- Jest-compatible file-boundary bail thresholds through `--bail`/`-b`,
  `--no-bail`, and boolean or numeric configuration. Serial scheduling stops
  exactly after the threshold-reaching file; parallel scheduling atomically
  rejects queued results and terminates in-flight Node workers. Differential
  markers prove both CLI threshold one and configured threshold two behavior.
- Jest-compatible new and updated inline snapshot source writes using V8
  callsites, transformer source-map remapping, and Babel call-expression
  replacement. Byte-for-byte differentials cover CommonJS, transformed
  JavaScript, TypeScript, native ESM, property matchers, thrown errors, promise
  chains, template escaping, multiple callsites, and retry rollback.
- Jest-compatible project Prettier integration for inline source writes through
  worker protocol v17. Default module lookup, explicit `prettierPath`, and the
  `null` opt-out are normalized; Prettier 2 and 3 both format the whole file and
  retain Jest's multiline snapshot indentation. Differential fixtures compare
  the rewritten source byte-for-byte with official Jest.
- Jest-compatible implicit configuration discovery from nested working
  directories. The search climbs in Jest's extension order, accepts a parent
  package without a `jest` field as the default-config root, stops at the
  nearest nested package boundary, and rejects trees with no config or package
  root. Three differential fixtures preserve the discovered test-file sets.
- Jest-compatible `moduleDirectories` normalization and resolution in worker
  protocol v18. Ordered absolute roots and ancestor-relative directory names
  apply to CommonJS, mocks, `requireActual`, `require.resolve`, and static or
  dynamic native ESM with Jest's require/import conditions. A separate probe
  proves that omitting `node_modules` excludes the fixture's local package.
- A configured custom-resolver bridge in worker protocol v19. CommonJS or
  top-level-await ESM resolver modules are preloaded, function and `{sync}`
  exports receive Jest-shaped options and default callbacks, and canonical
  results feed CommonJS mocks/actuals plus static and dynamic native ESM.
- Async-only custom resolver exports prepared before native-ESM evaluation.
  Static and rewritten dynamic imports await the resolver, cache by importer,
  specifier, and mode, and feed the later synchronous Node hook; CommonJS
  deliberately retains Jest's default resolver when no `sync` export exists.
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
- A pinned AWS Amplify Predictions/Jest 29 corpus: exact 4/4 suites, 51/51
  tests with one skipped, and aggregate plus per-file Istanbul parity across 12
  source files on the first Rjest execution.
- A pinned AWS Amplify RTN Push Notification/Jest 29 corpus: exact 12/12 suites,
  28/28 tests, and aggregate plus per-file Istanbul parity across 13 source
  files on the first Rjest execution.
- A pinned top-level AWS Amplify facade/Jest 29 corpus: exact 7/7 suites, 50/50
  tests, and aggregate plus per-file Istanbul parity across 21 source files,
  including the public export inventory of the built workspace.
- Jest-aligned mock arity, call contexts/instances, recursive result finalization,
  undefined one-shot fallback behavior, repeated-spy identity, and restoration
  across inherited prototype methods.
- An automated differential denominator containing executable compatibility
  probes. The current generated result is 122/122 compatible scenarios (100.0%),
  with Core API at 13/13 (100.0%), ESM at 8/8
  (100.0%), transforms at 5/5 (100.0%), mocks at 13/13 (100.0%), configuration
  at 26/26 (100.0%), CLI at 6/6 (100.0%), environments at 7/7 (100.0%), and
  per-category scores in the machine-readable report. This is a score for the
  versioned probe corpus, not all Jest behavior.
- Custom Jest environment classes loaded from paths or Jest-prefixed packages,
  including CommonJS and top-level-await ESM exports, merged docblock options,
  Node/JSDOM subclasses, async setup/teardown, projected globals, environment
  export conditions, and awaited circus run/test/hook lifecycle events.
- Project-level `silent` configuration, Jest-version-aware implicit `.mts`
  discovery, Node 25-safe mixed ESM/CommonJS loader coordinates, extensionless
  transformed TypeScript ESM resolution, and Jest-shaped custom-environment
  root describe events.
- A pinned NVIDIA Nsight VS Code/Jest 30 corpus: exact parity for 8/8 suite
  paths and all 95 test statuses under an ESM custom environment and native
  TypeScript transformer. Both runners reproduce 94 passing tests and the same
  one upstream macOS path failure with zero Rjest file errors.
- Yarn Plug'n'Play resolution through a genuine preloaded `pnpapi`, with a
  pinned Yarn 4 differential fixture covering portal packages, static/dynamic
  native ESM, CommonJS `createRequire`, import/require conditional exports, ESM
  module mocks, and undeclared transitive dependency errors.
- Native-first `.ts`/`.cts` Jest config loading on modern Node, preserving ESM
  package semantics and `import.meta` while retaining a syntax-error ts-node
  fallback for CommonJS configs. The Apollo Client corpus supplied the real
  failure and a permanent differential fixture preserves the repair.
- Inline Jest `projects` normalization and coordinator execution. Every child
  retains its own root, discovery rules, resolver, transforms, environment,
  setup, snapshots, and display name; repeated paths execute once per project,
  while `--listTests` reports the same unique path set as Jest. Differential
  fixtures cover two mappings over one file and invocation-relative CLI paths
  into a child root.
- Jest `preset` loading and merge behavior for local or package presets,
  including inherited setup modules, mappings, transforms, and configured
  overrides. Apollo's `ts-jest` preset now loads without a corpus-specific
  shortcut.
- `snapshotFormat.escapeString` and `printBasicPrototype` in worker protocol
  v20, with byte-compatible consumption of an official-Jest snapshot.
- Recursive `expect.addEqualityTesters`, matcher-context `equals`, and shared
  matcher state when setup code extends the installed `expect` package.
- Jest-aligned CommonJS resolver conditions around Node's synchronous-ESM
  boundary, plus mapped CommonJS `.js` execution inside a type-module package.
  The custom-JSDOM bridge retains host scheduler and performance APIs to avoid
  cross-realm recursion while exposing the environment's `window` APIs.
- Jest Circus `test.failing`/`it.failing` inversion for synchronous,
  asynchronous, parameterized, focused, skipped, and concurrent declarations.
  Expected failures retain snapshot files and inline sources even in update
  mode, while unexpectedly passing bodies fail with Jest's diagnostic.
- Custom matchers installed through `expect.extend` now also expose Jest-style
  `expect.matcher(...)` and `expect.not.matcher(...)` asymmetric factories.
  This repaired Apollo's `toBeOneOf` matcher and produced exact 30/30 status
  parity for `responseIterator.ts` across all three Core projects.
- Jest matcher-context utilities used by ecosystem extensions, including
  explicit equality testers, `iterableEquality`, color functions, diffs, and
  `printDiffOrStringify`. The unchanged Apollo `ObservableQuery.ts` probe now
  matches 3/3 suites and all 435 statuses: 411 passed and 24 skipped.
- Jest mock-function snapshot serialization with mock names, calls, return and
  throw results, and configured prototype formatting. Apollo's unchanged
  `ApolloClient.ts` now matches 3/3 suites, all 243 statuses, and 60/60 snapshots
  across the three Core dependency variants.

## Current work

- Apollo Client 4.2.12 is pinned as a current Jest 30, TypeScript, React
  17/18/19 multi-project corpus. Official Jest registers 563 suites and 9,974
  tests, with 538 suites passing, seven failing, 18 skipped, 9,489 tests
  passing, nine failing, 476 skipped, and 519/519 snapshots matched. Rjest and
  Jest now list the same 196 unique test paths from the unchanged six-project
  config. A Core masking file passes 78/78 assertions across its three dependency
  variants, and a React hook file passes 123/123 across React 17, 18, and 19.
  A Core response-stream file passes 30/30 across its three variants with exact
  suite paths and test identities/statuses. `ObservableQuery.ts` also matches
  all 435 identities/statuses across the Core variants, with 411 passing and 24
  skipped. `ApolloClient.ts` matches another 225 passing and 18 skipped tests
  plus 60 snapshots. The full 563-suite Rjest capture remains the current
  compatibility run.

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
and category and overall percentages. Repaired gaps remain permanent regression
entries. The current probe corpus score is 122/122 (100.0%). Core API is 13/13
(100.0%), ESM is 8/8
(100.0%), transforms are 5/5 (100.0%), mocks are 13/13 (100.0%), configuration
is 26/26 (100.0%), CLI is 6/6 (100.0%), resolution is 12/12 (100.0%), snapshots
are 13/13 (100.0%), Expect is 7/7 (100.0%), environments are 7/7 (100.0%), and
coverage is 3/3 in
their bounded scenario categories.

## Known blockers

- Inline object entries in Jest `projects` are normalized and scheduled, but
  string project paths/globs and every multi-project coverage, sharding, bail,
  display-color, and reporter edge remain incomplete. The full Apollo capture
  is required before this surface can be described as corpus-compatible.
- Jest extglob syntax is recognized for the two default patterns; complete custom
  Jest glob semantics are not yet implemented.
- Configured synchronous, processAsync-only, and implicit `babel-jest`
  transforms work. Async ESM transformer modules/factories, injected static
  dependencies, dynamic imports, and coverage are differential-tested.
  Transformer cache-key persistence, decorators outside the project transformer,
  and TypeScript path aliases remain incomplete.
- Synchronous, async-only, and disagreeing dual-hook custom resolvers work
  across the covered CommonJS/native-ESM paths. Forwarding is verified for
  `mainFields`, `alias`, and `extensionAlias`. Portal-backed Yarn PnP package
  resolution is covered separately; the rest of the current Jest resolver
  option surface, pnpm layouts, zip-backed PnP entries, and custom-resolver/PnP
  combinations remain open.
- V8 coverage, non-global threshold groups, watch mode, exact custom-environment
  VM-context identity, worker reuse, and run-wide Ctrl+C cancellation are not
  implemented.
- Fresh Node/JSDOM/transformer startup per test file is a major performance
  bottleneck: the pinned Amplify Core serial run is compatible but about 19.35
  times slower than Jest by reported runner time, while Auth is about 19.83
  times slower, Storage is about 14.67 times slower, and DataStore is about
  4.17 times slower. Notifications is about 29.95 times slower and Adapter
  Next.js is about 35.78 times slower. API REST is about 6.32 times slower and
  the aggregate API package is about 9.92 times slower. PubSub is about 2.20
  times slower, Interactions is about 13.10 times slower, and React Native is
  about 4.54 times slower in the ordinary no-coverage mode. Predictions is
  about 10.60 times slower, RTN Push Notification about 12.80 times slower, and
  the top-level Amplify facade about 17.09 times slower by reported runner time.
  The Nsight language-support suite is about 3.39 times slower by reported
  runner time, despite using roughly half the peak RSS in the single capture.

## Next highest-value tasks

1. Complete and machine-compare Apollo Client's full six-project Rjest run,
   then reduce the largest mismatch class against its 9,974-test oracle.
2. Turn deterministic failures from that full Apollo run into permanent
   official-Jest differential scenarios.
3. Run an independent Yarn PnP monorepo with zip-backed dependencies unchanged.
4. Add broader timer edge-case probes and modern timer tick-mode controls.
5. Replace per-file Node/JSDOM/transformer startup after correctness remains
   stable across a broader independent corpus.
