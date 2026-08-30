# Migrating from Jest

Rjest is not ready for production migration yet. Node and JSDOM projects can
already try replacing `jest` with the built `rjest` binary when they use global
`describe`/`test`/`it`, hooks, async tests, common matchers, `jest.fn`,
method/accessor spies, explicit CommonJS module mock factories, configured
Jest transforms, modern or legacy fake timers, and ordinary external or existing
inline snapshots.

Start with `rjest --listTests`, then use `rjest --runInBand` before enabling the
default bounded parallel execution. Follow the compatibility matrix rather than
assuming an unlisted Jest behavior works, and keep Jest as the release gate until
the project's own suite is proven equivalent.

Rjest reads existing Jest snapshot files without rewriting them when values
match and loads configured snapshot serializers. Existing inline snapshots are
matched and counted; inserting or updating inline source text is not supported.
Use `rjest --updateSnapshot` only after reviewing the compatibility result.

Common `jest.config.js`, CJS, ESM, and erasable TypeScript config files can be
used directly, as can Jest's inline JSON form of `--config`. Rjest normalizes
discovery, environment/options, transform,
setup-after-env, serializer, module-path, timeout, worker, and common tooling
fields, including project-level `silent`; unsupported options are migration
work items and produce an explicit error. For implicit `jest.config.mts`
discovery, Rjest follows an installed Jest version's boundary: Jest releases
before 30.4 ignore that filename, while 30.4 and later treat it as a config.
On Node versions with native TypeScript support, `.ts` configuration also keeps
the package's CommonJS or ESM semantics, including `import.meta` in a
`"type": "module"` project. Native syntax failures in `.ts`/`.cts` retain the
ts-node fallback; `.mts` remains ESM-only.

Root `projects` arrays may contain inline objects, project directories,
supported config-file paths, and standard path globs. The variadic
`rjest --projects project-a project-b` form also runs several project
directories or config files in one invocation. Display-name filtering through
`--selectProjects` and `--ignoreProjects` follows Jest's composed selection and
exclusion rules. Keep Jest as the gate for unmeasured cross-project coverage,
bail, reporter combinations, or custom test sequencer sharding. Default
multi-project sharding uses each test's own project root in the covered case.

Configured CommonJS and native-ESM `testSequencer` classes can shard and sort
the complete selected matrix, receive `cacheResults` on the same instance, and
select failures through `allFailedTests`. The default native sequencer persists
failure/duration history across processes, so `rjest --onlyFailures` and
`rjest -f` rerun previously failing assertion or file-error suites. Fully
skipped reruns preserve earlier failure state. Keep Jest as the gate for
custom-resolver sequencer lookup. `cache`, `cacheDirectory`, `--cache`,
`--no-cache`, and `--clearCache` control this sequencer history; Rjest still has
no persisted transform/discovery cache, so disabling cache does not otherwise
change transform execution. The default directory is Rjest-namespaced rather
than shared with Jest.

The `fakeTimers` configuration supports global modern or legacy activation,
`advanceTimers`, `doNotFake`, `now`, and `timerLimit`. Explicit
`jest.useFakeTimers({legacyFakeTimers: true})` retains Jest's zero-based legacy
clock, mock timer functions, real `Date`/`performance`, and legacy-only
`runAllImmediates` behavior. Automatic modern advancement supports Jest's
boolean 20 ms default and numeric cadence.

`setupFiles` and `setupFilesAfterEnv` retain their separate Jest lifecycle
phases. Rjest also accepts Jest's `-w` worker alias and reports per-file heap
usage with `--logHeapUsage`; its fresh-process-per-file architecture makes
`workerIdleMemoryLimit` a normalized no-reuse threshold rather than a recycled
worker trigger.

Test-file docblocks may override the configured Node or JSDOM environment with
`@jest-environment`. JSON supplied through `@jest-environment-options` is
merged over the project's environment options before the file is transformed
and evaluated. Custom environment classes can be referenced by explicit path
or Jest-prefixed package name. CommonJS and top-level-await ESM exports receive
Jest-shaped config/context, async setup and teardown, projected globals, export
conditions, and awaited circus lifecycle events.

JSDOM projects can redefine or spy on `window`, `self`, `navigator`, storage,
and IndexedDB globals using the patterns covered by the differential suite.
Rjest also isolates JSDOM's initial lifecycle events from test-side global
constructor mocks and does not expose Node-only `TextEncoder` or `TextDecoder`
when the installed JSDOM window omits them. Complete custom environment
VM-context identity remains outside the current compatibility claim: Rjest
currently bridges a custom environment's globals into the file worker rather
than evaluating every test module inside `getVmContext()`.

The fake-indexeddb constructor family, including `IDBRequest`,
`IDBTransaction`, `IDBDatabase`, and related cursor/object-store globals,
remains linked to assignments on `window`. Pending zero-delay JSDOM callbacks
are also discarded during file teardown instead of being drained between
completed tests, matching the covered Jest lifecycle.

Assignments to `window.XMLHttpRequest`, `window.FileReader`, and
`window.ReadableStream` remain visible through their bare global names. JSDOM's
`ArrayBuffer` realm is also distinct from buffers returned by Node-only
constructors, matching the covered Jest behavior while transformer tooling
continues to use Node host intrinsics.

`rjest --coverage` supports Babel-Jest instrumentation, parallel map merging,
positive and negated `collectCoverageFrom` globs, coverage path ignores, JSON,
JSON-summary, text, text-summary, LCOV/HTML, and Clover output, plus global
positive-percentage and negative-uncovered thresholds. Keep Jest as the
coverage gate when using the V8 provider, custom Istanbul reporters, or
path/glob-specific threshold groups.

Projects using ordinary Node-relative imports, CommonJS `require`, ESM package
exports, and standard `node_modules` packages can exercise those paths today.
Transformed native ESM also falls back to Jest's configured extension order
when Node rejects a relative import, including extensionless `.ts` imports.
`moduleNameMapper` supports ordered rules, capture substitution, and fallback
targets for CommonJS, transformed CommonJS, and the covered native-ESM paths.
When launched under a preloaded Yarn Plug'n'Play runtime, Rjest uses `pnpapi`
for CommonJS and native-ESM package resolution. The differential suite covers
local portal dependencies, import/require conditional exports, dynamic imports,
ESM mocks, and undeclared-dependency errors. Keep Jest as the gate for
zip-backed PnP packages, PnP monorepo workspaces, pnpm-specific layouts,
unmeasured custom-resolver combinations, or transform-time path rewriting
outside configured Jest transforms.

Native ESM transformation awaits `processAsync` when a transformer provides it
and otherwise falls back to `process`. Rjest also awaits asynchronous
`createTransformer` factories and can load ESM transformer modules with top-level
await. Static dependencies introduced by transformed output and later dynamic
imports are prepared before Node's synchronous in-process loader hook consumes
them. Keep Jest as the gate for custom transform cache-key behavior not covered
by the differential suite.

CommonJS suites may use `jest.mock` or `jest.doMock` before the corresponding
`require`, plus `jest.requireActual`, `jest.requireMock`, and
`jest.createMockFromModule`. Configured and runtime CommonJS automocking covers
nested exports and classes, manual `__mocks__` files are resolved for adjacent
and ancestor/bare-module cases, and Babel-Jest hoists standard mock factories.
Virtual CommonJS mocks and direct synchronous or asynchronous
`jest.unstable_mockModule` factories are supported when the mocked relative,
package, or built-in module is loaded with dynamic `import()`. Successful async
factories are cached, rejected factories remain retryable, and Jest's concurrent
first-import factory race is preserved. Jest 29's legacy
`jest.genMockFromModule` alias is also available, and metadata discovery is
isolated from the active mock registry. Ordinary `jest.spyOn` supports
getter-backed function exports as well as explicit accessor spies.
`jest.isolateModules` provides a temporary CommonJS module registry. ESM
`unstable_unmockModule` restores relative, package, and built-in modules while
preserving Jest's evaluated-mock cache behavior; `resetModules` refreshes actual
ESM instances and re-runs retained mock factories. Async ESM factories reached
through static imports are initialized only when their dependency graph is
loaded, so unrelated registered factories are not invoked.
`jest.isolateModulesAsync` keeps fresh CommonJS and ESM registries active across
awaits, discards instances first created inside the callback, inherits mocks
already evaluated outside, and restores the outer registries after errors.
With `automock: true`, native ESM functions, classes, nested methods, arrays,
static imports, dynamic imports, and package exports are generated from isolated
actual-module metadata. `unstable_unmockModule`, explicit factories,
`disableAutomock`, `resetModules`, and async isolation retain their covered Jest
precedence and lifecycle. Sibling/root ESM `__mocks__` files and deeply unmocked
transitive dependencies remain incomplete.

Custom matchers registered through `expect.extend` may return promises and use
the matcher context such as `this.equals`. `toThrow` and promise-modified
`toThrow` accept the covered asymmetric matchers and plain error-property
objects as well as strings, regular expressions, constructors, and errors.
The mutable state returned by `expect.getState()` exposes the current test path,
name, assertion count, and assertion requirements; `expect.setState()` can
merge additional matcher state.

External and existing inline snapshots accept nested property matchers and
serialize their asymmetric placeholders like Jest. Rjest still cannot write a
new inline snapshot back into the test source.
