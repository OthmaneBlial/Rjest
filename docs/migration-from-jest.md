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
fields; unsupported options are migration work items and produce an explicit
error.

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
and evaluated. Custom environment classes remain outside the current claim.

JSDOM projects can redefine or spy on `window`, `self`, `navigator`, storage,
and IndexedDB globals using the patterns covered by the differential suite.
Rjest also isolates JSDOM's initial lifecycle events from test-side global
constructor mocks and does not expose Node-only `TextEncoder` or `TextDecoder`
when the installed JSDOM window omits them. Complete custom environment
behavior remains outside the current compatibility claim.

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
`moduleNameMapper` supports ordered rules, capture substitution, and fallback
targets for CommonJS, transformed CommonJS, and the covered native-ESM paths.
Keep Jest for suites relying on custom resolvers, pnpm/Yarn PnP edge cases, or
transform-time path rewriting outside configured Jest transforms.

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
Deeply unmocked transitive dependencies remain incomplete.

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
