# Jest compatibility

Compatibility is tracked in the machine-readable
[`compat/jest-compatibility.json`](../compat/jest-compatibility.json) matrix.
Counts come only from executable Rust and Jest/Rjest differential tests;
placeholders are never counted. The differential harness normalizes test names,
statuses, files, and exit codes while deliberately ignoring timing and cosmetic
output differences.

The current generated matrix is 121/121 (100.0%) across its explicitly listed
scenarios and categories. Core API is 13/13 (100.0%), ESM is 8/8 (100.0%),
transforms are 5/5 (100.0%), mocks are 13/13 (100.0%), and configuration is
26/26 (100.0%). Resolution is 12/12 (100.0%), snapshots are 12/12 (100.0%),
Expect is 7/7 (100.0%), CLI is 6/6 (100.0%), and environments are 7/7
(100.0%). These
are scores for the bounded regression set, not claims about the unmeasured full
Jest API.

The current alpha supports JSON/package and executable JavaScript/TypeScript
configuration, native discovery, isolated JS execution, configured synchronous
and asynchronous Jest transforms for JSX/TypeScript, Node and JSDOM
environments, nested hooks, async tests, common matchers,
function/method/accessor mocks, CommonJS module
mocks, external Jest v1 snapshots, existing inline snapshots, configured
serializers, snapshot property matchers, modern and legacy fake timers, and ordered
`moduleNameMapper` rules for CommonJS and transformed modules. Configured and
runtime CommonJS automocking covers recursive exports and classes, while
native-ESM automocking covers static/dynamic and package imports, recursive
metadata, explicit factories/unmocking, reset, and isolated registries.
Native-ESM manual mocks cover sibling and root lookup, root precedence,
unresolvable bare names, scratch dependency registries, reset, and isolation.
Generated CommonJS and native-ESM automocks run registered `onGenerateMock`
callbacks in order while authored manual mocks and explicit factories bypass
them.
Implicit configuration discovery traverses parent directories in Jest's file
extension order, treats a package without a `jest` field as a default-config
project root, and stops at the nearest package boundary. Invocations without a
config or package root fail instead of silently choosing the current directory.
Because official Jest added implicit `jest.config.mts` discovery in 30.4,
Rjest follows the locally installed `jest-config`/`jest` version when one is
present. This preserves older Jest 30 `.mjs` wrapper projects while retaining
current multiple-config errors for Jest 30.4 and later. Project-level `silent`
configuration is normalized alongside the CLI flag.
TypeScript config evaluation is native-first on supported Node versions, so a
`.ts` file inside a type-module package retains ESM and `import.meta` semantics.
CommonJS `.ts`/`.cts` configs still fall back to ts-node when native loading
fails with a syntax error; `.mts` remains strictly ESM.
Inline object entries in `projects` are normalized as independent project
configs and executed with their own discovery, environment, resolver,
transform, setup, snapshot, and display-name state. The same physical test can
therefore execute under multiple dependency mappings, while `--listTests`
deduplicates paths like Jest. CLI paths are resolved from the invocation
directory before each project's patterns are applied. String project paths and
globs remain unsupported. Jest presets can be loaded from explicit paths or the
conventional `<package>/jest-preset` entry and merge inherited setup arrays,
module mappings, transforms, and ordinary options before project overrides.
CommonJS `deepUnmock` propagates actual-module decisions through dependencies
and cycles while retaining explicit-factory priority and ordinary-parent mocks.
`jest.replaceProperty` covers prototype lookup, repeated handles, descriptor
validation, symbol/number keys, and restoration alongside spies.
Configured `restoreMocks` restores setup- and test-created spies/properties
before each test while retaining standalone mock state.
Configured `resetMocks` clears mock calls and implementations before each test,
without restoring spies/properties, and reinstalls globally enabled legacy timer
APIs while preserving their pending queue.
Configured `resetModules` clears setup/test CommonJS instances, retains factory
decisions with fresh values, and advances native ESM generations before each
test.
`jest.setMock` injects explicit CommonJS exports with caller-relative identity,
reset persistence, factory replacement, primitive values, and later unmocking.
`jest.retryTimes` supports deferred and immediate per-test retries, hook and
assertion-state reinitialization, real-time delays, retry reasons and invocation
metadata, and snapshot-attempt rollback. Jest 30 whole-describe retries rerun
the complete hook/test lifecycle, compose through nested retrying describes,
and preserve non-retryable ancestor, process, and `afterAll` failure boundaries.
`test.failing` and `it.failing` invert only the test body result, leaving hook
and assertion-count failures ordinary. Sync/async bodies, `.each`, `.only`,
`.skip`, concurrent declaration chains, and the unexpected-pass diagnostic are
differentially covered. Snapshot matchers in failing tests stay read-only even
under `--updateSnapshot`, including missing inline snapshots.
`jest.getSeed`, `--seed`, and `--showSeed` share one validated signed 32-bit run
seed across workers.
`--randomize` uses Jest's seeded xoroshiro128plus stream and in-place
Fisher-Yates order independently in every file, shuffles each describe exactly
once, retains that order across whole-describe retries, and enables seed output.
The `randomize` and `showSeed` configuration fields follow the same behavior.
`--shard=n/m` validates Jest's one-based pair format, hashes root-relative
POSIX test paths with SHA-1, balances remainder files into earlier shards, and
selects the partition before bounded Rust worker scheduling.
`--bail`/`-b`, `--no-bail`, and boolean or numeric `bail` configuration stop
dispatch between files according to Jest's cumulative failed-test threshold.
Parallel bail atomically stops queued work and terminates in-flight Node workers;
the result that reaches the threshold is retained, while later results are not.
New and mismatched inline snapshots rewrite the original matcher callsite in
update modes. V8 stack locations are remapped through transformer source maps,
then Babel parses and regenerates only the matched call expression. The
differential covers CommonJS, transformed JavaScript, TypeScript, native ESM,
property matchers, thrown errors, promise chains, escaping, multiple callsites,
and discarded retry attempts with byte-for-byte source comparison. Jest's
default `prettier` module lookup, explicit `prettierPath`, and `null` opt-out
are normalized. Configured Prettier 2 and 3 format the complete source file and
then preserve Jest's special multiline snapshot indentation; both branches are
byte-compared with official Jest.
External snapshot serialization also honors the supported
`snapshotFormat.escapeString` and `printBasicPrototype` options. The fixture
consumes the snapshot produced by official Jest byte-for-byte.
Configured `moduleDirectories` preserve Jest's ordered absolute roots and
ancestor-relative directory names. The Rust-backed resolver applies CommonJS
and native-ESM export conditions, configured extensions, `require.resolve`,
mock/actual identity, closest-directory lookup, explicit `node_modules`
retention, and deliberate exclusion when that name is omitted.
Configured custom resolvers are preloaded from CommonJS or native ESM, including
top-level await, and accept either a function or `{sync}` export. Rjest supplies
Jest-shaped basedir, require/import conditions, extensions, module directories,
module paths, root, `defaultResolver`, and `defaultAsyncResolver` options. The
differential covers custom CommonJS/ESM targets, ordinary fallback packages,
mock/actual identities, static/dynamic imports, and synchronous object exports.
Async-only resolver exports retain Jest's default synchronous CommonJS path,
while native-ESM graph preparation awaits their static and dynamic resolutions
and caches the canonical result for Node's later synchronous hook.
When Yarn Plug'n'Play is active, Rjest obtains the special `pnpapi` module from
the preloaded runtime and resolves source requests with the applicable Jest
`import` or `require` condition set. A pinned, network-free Yarn 4 fixture
proves portal dependency lookup, conditional exports, static and dynamic ESM,
CommonJS `createRequire`, ESM module mocking, and undeclared-dependency errors.
This fixture does not yet establish compatibility for zip-backed cache entries,
PnP monorepo workspaces, or combinations with custom resolvers.
CommonJS resolution adds Node's `module-sync` condition only when the running
Jest-compatible VM can synchronously evaluate an ESM graph. A separate fixture
proves that a mapped `.js` module executes as CommonJS in a CommonJS Jest
runtime even when its containing package declares `"type": "module"`.
Custom test environment references accept explicit paths and Jest's package
prefix lookup. CommonJS and top-level-await ESM environment classes receive
merged project/docblock options, constructor context, async setup/teardown,
projected globals, custom export conditions, and awaited circus lifecycle
events. Differential fixtures cover a Node subclass with exact setup, hook,
test, run, and teardown events plus an ESM JSDOM subclass with browser globals
and configured URL. Rjest currently bridges environment globals into its Node
worker realm. Host performance and scheduling functions stay native because
projecting JSDOM's same-named functions into that shared realm makes JSDOM call
itself recursively; the environment's `window` functions remain available.
Exact custom VM-context identity and every mutable circus state field remain
outside this bounded claim.
Bespoke equality functions registered through `expect.addEqualityTesters`
participate recursively in equality-based matchers and receive Jest's matcher
context. Setup modules that extend the installed `expect` package share the
same matcher registry as the injected global `expect`.
Every custom matcher installed with `expect.extend` also creates positive and
negative asymmetric factories on `expect`, using the same matcher context and
custom equality testers as its assertion form.
The matcher context includes the covered Jest utility surface for extension
packages: strict equality with explicit testers, generic iterable equality,
expected/received color functions, structural diffs, and
`printDiffOrStringify`. Rjest currently emits plain text from the color helpers.
Babel-Jest hoists standard mock factories. Babel coverage supports parallel
Istanbul-map merging, `collectCoverageFrom`, common reports, and global
thresholds. Manual `__mocks__` lookup, virtual CommonJS factories, assertion
counts, and transformer/test cache isolation are covered. Complete
resolution/config semantics, V8 coverage, path/glob threshold groups, and watch mode remain missing, so Rjest
does not claim broad or drop-in Jest compatibility yet.

The modern timer surface includes animation-frame scheduling, cancellation,
timestamps, and `advanceTimersToNextFrame` in JSDOM. Legacy mode preserves its
separate zero-based scheduler, Jest-mock timer APIs, Node timer references, real
wall-clock APIs and microtask queue, `runAllImmediates`, queue ordering, and
modern-only API errors. Node and JSDOM behavior is differential-tested, as are
globally enabled legacy and modern timer configuration. Modern automatic
wall-clock advancement supports the boolean 20 ms default and a numeric cadence.

Native Node resolution is verified for relative CommonJS/ESM modules, package
self-references and `exports`, and scoped packages under `node_modules`.
When native ESM resolution rejects a relative path, Rjest applies the configured
Jest extension order; this is differentially verified for an extensionless
transformed `.ts` dependency. Mixed ESM/CommonJS setup loading also preserves
absolute package requests when Node's hook context has no parent URL.
CommonJS mapping is verified for capture expansion, first-match ordering,
fallback targets, `require.resolve`, and Jest mock identity. Native-ESM mapping,
transformed TypeScript ESM, `@jest/globals`, and direct synchronous or
asynchronous `unstable_mockModule` factories are also verified. The async probe
covers relative modules, scoped packages, Node built-ins, default/named/exotic
exports, factory caching, rejection retries, concurrent first imports,
transitive static graphs, re-exports, transformed TypeScript, and unused-factory
laziness. `unstable_unmockModule` and `resetModules` cover actual and mocked ESM
registries, including Jest's retained evaluated-mock cache.
`isolateModulesAsync` covers fresh successive ESM graphs, CommonJS caches held
across awaits, isolated first-use mocks, inherited outer mock instances, nested
call rejection, cleanup after callback errors, and Jest's reset-inside-isolation
lifecycle. Async transformer coverage verifies an ESM transformer module with
top-level await, an asynchronous factory, processAsync-only static and dynamic
graphs, transformer-injected dependencies, and post-transform Istanbul
instrumentation. Custom resolvers are also checked with disagreeing sync/async
hooks and with `mainFields`, `alias`, and `extensionAlias` overrides forwarded
through both default-resolver callbacks. The broader current Jest resolver
option surface, pnpm-specific layouts, and zip-backed or workspace-heavy Yarn
PnP projects remain open work; Jest 30's `unrs-resolver` bridge no longer
exposes the older function-based `packageFilter` option.

Run the oracle locally with `npm run compat`; `make check` includes it.

The real-project corpus is reported separately from the scenario score. On the
pinned Downshift checkout and dependency installation, both official Jest and
Rjest discover and pass 92/92 suites, 1,110/1,110 tests, and 49/49 snapshot
assertions. This establishes compatibility for that exact corpus, not for
unmeasured Jest behavior. The pinned versions and commands are in the
[Downshift corpus report](corpus/downshift.md).

The pinned [React Select corpus](corpus/react-select.md) adds an older Jest 25,
Babel 23, React 16, TSX, JSDOM, Emotion-serializer workload: both runners agree
on 5/5 suites, 255 passing tests, 3 skipped tests, and 5/5 snapshots. Coverage
also matches across 39 files: 1,064/1,438 statements, 659/1,054 branches,
251/312 functions, and 1,033/1,363 lines. The upstream `jest --coverage` script
can therefore be replaced by `rjest --coverage` on this pinned checkout.

The pinned [setup-matlab corpus](corpus/setup-matlab.md) adds Jest 30 native
ESM, `ts-jest`, top-level await, JSON import attributes, ESM module mapping,
and 25 `unstable_mockModule` registrations. Both runners pass 7/7 suites and
94/94 tests with identical aggregate and per-file coverage summaries across
nine TypeScript sources. Rjest is materially slower on this workload; the
result is compatibility evidence, not a benchmark win.

The pinned [ts-jest corpus](corpus/ts-jest.md) adds a compiler-heavy TypeScript
transformer project with executable TypeScript configuration, 116 tests in its
largest suite, parameterized snapshot keys, manual and virtual mocks, and
transformer-runtime isolation. Both runners pass 20/20 suites, 358/358 tests,
and 137/137 snapshots without modifying the checkout.

The pinned [AWS Amplify Analytics corpus](corpus/amplify-analytics.md) adds a
Yarn workspace monorepo built through its real 20-task production pipeline.
The unchanged Jest 29 package suite passes 30/30 suites and 111/111 tests under
both runners, with exact aggregate and per-file Istanbul summary parity across
58 TypeScript sources.

The pinned [AWS Amplify Core corpus](corpus/amplify-core.md) expands that same
unchanged monorepo to 94/94 suites, 632/632 tests, and 2/2 snapshots. The
machine comparison finds exact test-name/status parity, zero Rjest file errors,
and exact aggregate and per-file Istanbul summary parity across 204 source
files. The serial Rjest run is materially slower, so the result is correctness
evidence rather than a performance claim.

The pinned [AWS Amplify Auth corpus](corpus/amplify-auth.md) adds the same
strict proof for 101/101 suites and 1,150/1,150 tests. The reusable corpus
comparator verifies exact suite paths, test names/statuses, snapshot counts,
and aggregate plus per-file Istanbul summaries across 198 source files, with
zero Rjest file errors. Run it with `npm run compare:corpus` against captured
Jest and Rjest JSON results.

The pinned [AWS Amplify Storage corpus](corpus/amplify-storage.md) adds 85/85
suites and 850/850 tests from the unchanged package. The machine comparison is
exact across all test identities/statuses and 129 per-file Istanbul summaries.
This corpus covers asynchronous custom matchers, asymmetric and object
`toThrow` expectations, mutable JSDOM XHR constructors, and Node/JSDOM realm
separation.

The pinned [AWS Amplify DataStore corpus](corpus/amplify-datastore.md) adds
fake IndexedDB, Dexie, RxJS, TSX type tests, and `expect.getState()` on the same
unchanged monorepo. Both runners discover 33 suites and 1,174 tests, pass 1,160
with 14 skipped, match 8 snapshots, and produce identical aggregate and
per-file Istanbul summaries across 29 sources. The comparator strictly matches
all executed identities and uses an explicit per-file count policy only for 12
skipped fuzz-test labels generated with `Math.random()`.

The pinned [AWS Amplify Notifications corpus](corpus/amplify-notifications.md)
adds 61 suites and 261 tests across Pinpoint messaging, signed requests,
React Native branches, and per-file Jest environments. Test identities and
statuses are exact, and all aggregate plus per-file Istanbul summaries match
across 90 sources. Its only initial failures came from ignoring a Node
environment docblock inside a JSDOM-configured project.

The pinned [AWS Amplify Adapter Next.js corpus](corpus/amplify-adapter-nextjs.md)
adds a Node/Next.js server workload with 41 suites, 301 registered tests, one
snapshot, automatic and factory mocks, `doMock`, `resetModules`, accessor
spies, and package exports. The unchanged suite passes on the first Rjest
diagnostic, and the strict machine comparison is exact across all test
identities/statuses and 50 per-file Istanbul summaries.

The pinned [AWS Amplify API REST corpus](corpus/amplify-api-rest.md) adds 10
suites and 208 tests covering cancellation, request signing, response parsing,
automatic/factory mocks, `jest.mocked`, and timeout spies. The unchanged suite
passes on the first Rjest diagnostic, with exact test identity/status and
aggregate plus per-file Istanbul parity across 24 source files.

The pinned [aggregate AWS Amplify API corpus](corpus/amplify-api.md) adds 2
suites and 86 tests over the built GraphQL, Adapter Next.js, SSR, and package
export surfaces. Test identities/statuses are exact and both runners return the
same empty coverage map configured by this package.

The pinned [AWS Amplify PubSub corpus](corpus/amplify-pubsub.md) adds
MQTT-over-WebSocket providers, topic wildcards, network recovery, reconnection
timers, Observables, and the vendored Paho MQTT runtime. Both runners pass the
17 tests and agree on every Istanbul summary across 14 source files.

The pinned [AWS Amplify Interactions corpus](corpus/amplify-interactions.md)
adds Lex V1/V2 SDK clients, JSDOM blobs, recursive automatic mocks, mapped UUID
resolution, and `fflate` compression workers generated with `{eval: true}`.
Both runners pass all 30 tests and agree on every Istanbul summary across 19
source files.

The pinned [AWS Amplify React Native corpus](corpus/amplify-react-native.md)
adds native-module facades, platform selection, optional dependency loaders,
factory failures, `doMock`, `resetModules`, and TypeScript under JSDOM. Both
runners pass all 29 tests. Their explicit coverage diagnostics match across 19
files and both enforce the package's configured 100% global thresholds.

The pinned [AWS Amplify Predictions corpus](corpus/amplify-predictions.md) adds
AWS machine-learning clients, binary/browser data paths, and a large SDK module
graph. Both runners discover 4/4 suites and 51/51 tests, and match exact test
identities/statuses plus every Istanbul summary across 12 source files.

The pinned [AWS Amplify RTN Push Notification corpus](corpus/amplify-rtn-push-notification.md)
adds React Native facades, event listeners, permissions, and headless tasks.
Both runners pass 12/12 suites and 28/28 tests with exact test identities and
coverage across 13 files.

The pinned [top-level AWS Amplify facade corpus](corpus/amplify-aws-amplify.md)
validates public exports across built workspace packages, cookie storage, and
server-context cleanup. Both runners pass 7/7 suites and 50/50 tests with exact
test identities and coverage across 21 files.

The pinned [NVIDIA Nsight VS Code language-support corpus](corpus/nsight-vscode-language.md)
adds an independent Jest 30 project with an ESM custom environment, native
TypeScript transformer, ESM setup module, extensionless TypeScript imports,
and VS Code mocks. Both runners discover the same eight suites and reproduce
all 95 statuses exactly: 94 pass and the same one fails on macOS because of an
upstream `/var` versus `/private/var` assertion. The comparator reports exact
paths/statuses and zero Rjest file errors.

The pinned [Apollo Client corpus](corpus/apollo-client.md) records a separate
official Jest 30 baseline across six Core/React project configs: 563 suites,
9,974 tests, and 519 snapshots. Rjest now discovers the exact same 196 unique
paths from those project configs. Targeted unchanged probes pass 78/78 Core
assertions across three dependency variants and 123/123 React assertions across
React 17, 18, and 19. A third probe matches 30/30 response-stream assertions and
all suite/test identities across the three Core variants after repairing
`test.failing` and custom asymmetric matchers. `ObservableQuery.ts` adds exact
parity for another 435 registered statuses (411 passed and 24 skipped) after
completing Apollo's matcher-context utilities. The full result is still being
captured, so these probes are progress evidence rather than a corpus-wide parity
claim.

Executable configuration runs with the user's normal Node permissions, just like
Jest config. Rjest currently accepts the supported normalized subset and fails on
unknown fields rather than silently discarding them.
