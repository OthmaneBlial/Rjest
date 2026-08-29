# Migrating from Jest

Rjest is not ready for production migration yet. Node and JSDOM projects can
already try replacing `jest` with the built `rjest` binary when they use global
`describe`/`test`/`it`, hooks, async tests, common matchers, `jest.fn`,
method/accessor spies, explicit CommonJS module mock factories, configured
synchronous Jest transforms, modern fake timers, and ordinary external or
existing inline snapshots.

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

`setupFiles` and `setupFilesAfterEnv` retain their separate Jest lifecycle
phases. Rjest also accepts Jest's `-w` worker alias and reports per-file heap
usage with `--logHeapUsage`; its fresh-process-per-file architecture makes
`workerIdleMemoryLimit` a normalized no-reuse threshold rather than a recycled
worker trigger.

JSDOM projects can redefine or spy on `window`, `self`, `navigator`, storage,
and IndexedDB globals using the patterns covered by the differential suite.
Rjest also isolates JSDOM's initial lifecycle events from test-side global
constructor mocks and does not expose Node-only `TextEncoder` or `TextDecoder`
when the installed JSDOM window omits them. Complete custom environment
behavior remains outside the current compatibility claim.

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

CommonJS suites may use `jest.mock` or `jest.doMock` before the corresponding
`require`, plus `jest.requireActual`, `jest.requireMock`, and
`jest.createMockFromModule`. Configured and runtime CommonJS automocking covers
nested exports and classes, manual `__mocks__` files are resolved for adjacent
and ancestor/bare-module cases, and Babel-Jest hoists standard mock factories.
Virtual CommonJS mocks and synchronous `jest.unstable_mockModule` factories are
supported. Jest 29's legacy `jest.genMockFromModule` alias is also available,
and metadata discovery is isolated from the active mock registry. Ordinary
`jest.spyOn` supports getter-backed function exports as well as explicit
accessor spies. `jest.isolateModules` provides a temporary CommonJS module
registry. Deeply unmocked transitive dependencies and async ESM mock factories
remain incomplete.

External and existing inline snapshots accept nested property matchers and
serialize their asymmetric placeholders like Jest. Rjest still cannot write a
new inline snapshot back into the test source.
