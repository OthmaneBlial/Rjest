# Jest compatibility

Compatibility is tracked in the machine-readable
[`compat/jest-compatibility.json`](../compat/jest-compatibility.json) matrix.
Counts come only from executable Rust and Jest/Rjest differential tests;
placeholders are never counted. The differential harness normalizes test names,
statuses, files, and exit codes while deliberately ignoring timing and cosmetic
output differences.

The current generated matrix is 70/71 (98.6%) across its explicitly listed
scenarios and categories. ESM is 7/7 (100.0%) and transforms are 5/5 (100.0%);
mocks are 9/10 (90.0%) because the preserved `jest.onGenerateMock` probe still
differs. These are scores for the bounded regression set, not claims about the
unmeasured full Jest API.

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
Babel-Jest hoists standard mock factories. Babel coverage supports parallel
Istanbul-map merging, `collectCoverageFrom`, common reports, and global
thresholds. Manual `__mocks__` lookup, virtual CommonJS factories, assertion
counts, and transformer/test cache isolation are covered. Writing new inline
snapshots, complete resolution/config semantics, V8 coverage, path/glob
threshold groups, and watch mode remain missing, so Rjest does not claim broad
or drop-in Jest compatibility yet.

The modern timer surface includes animation-frame scheduling, cancellation,
timestamps, and `advanceTimersToNextFrame` in JSDOM. Legacy mode preserves its
separate zero-based scheduler, Jest-mock timer APIs, Node timer references, real
wall-clock APIs and microtask queue, `runAllImmediates`, queue ordering, and
modern-only API errors. Node and JSDOM behavior is differential-tested, as are
globally enabled legacy and modern timer configuration. Modern automatic
wall-clock advancement supports the boolean 20 ms default and a numeric cadence.

Native Node resolution is verified for relative CommonJS/ESM modules, package
self-references and `exports`, and scoped packages under `node_modules`.
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
instrumentation. Custom module directories, `jest.onGenerateMock`, and pnpm/Yarn
PnP layouts remain open work.

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

Executable configuration runs with the user's normal Node permissions, just like
Jest config. Rjest currently accepts the supported normalized subset and fails on
unknown fields rather than silently discarding them.
