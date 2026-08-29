# Migrating from Jest

Rjest is not ready for production migration yet. Small Node projects can already
try replacing `jest` with the built `rjest` binary when they use global
`describe`/`test`/`it`, hooks, async tests, common matchers, basic `jest.fn` or
method spies, erasable TypeScript syntax, and ordinary external `.snap` files.

Start with `rjest --listTests`, then use `rjest --runInBand` before enabling the
default bounded parallel execution. Follow the compatibility matrix rather than
assuming an unlisted Jest behavior works, and keep Jest as the release gate until
the project's own suite is proven equivalent.

Rjest reads existing Jest snapshot files without rewriting them when values
match. Use `rjest --updateSnapshot` only after reviewing the compatibility result;
inline snapshots and custom serializers are not supported yet.
