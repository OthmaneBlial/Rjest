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
used directly. Rjest normalizes discovery, environment/options, transform,
setup-after-env, serializer, module-path, timeout, worker, and common tooling
fields; unsupported options are migration work items and produce an explicit
error.

Projects using ordinary Node-relative imports, CommonJS `require`, ESM package
exports, and standard `node_modules` packages can exercise those paths today.
Keep Jest for suites relying on `moduleNameMapper`, custom resolvers, pnpm/Yarn
PnP edge cases, or transform-time path rewriting.

CommonJS suites may use `jest.mock` or `jest.doMock` before the corresponding
`require`, plus `jest.requireActual`, `jest.requireMock`, and
`jest.createMockFromModule`. Rjest does not yet hoist mock declarations, enable
global automocking, or implement Jest's ESM module-mocking API.
