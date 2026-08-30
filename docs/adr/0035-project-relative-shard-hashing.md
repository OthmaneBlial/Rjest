# ADR 0035: Hash shard candidates relative to their owning project

- Status: accepted
- Date: 2026-08-30

## Context

Jest applies default sharding after collecting tests from every selected
project. The sequencer hashes each path relative to the `rootDir` of the test's
own project, sorts the combined list by SHA-1, and then slices balanced shards.

Rjest flattened the same project matrix but hashed every path relative to the
coordinator's global root. For two child roots, `alpha/a.test.cjs` and
`beta/b.test.cjs`, that changed the hash order: official Jest placed alpha in
shard 1/2 while Rjest placed beta there.

## Decision

Retain each flattened test's project index and compute its normalized POSIX
relative path with that project's root before hashing. Stable-sort the combined
matrix by the SHA-1 bytes, calculate Jest's balanced shard bounds, and restore
the selected tests directly to their owning project runs.

Do not recover ownership by path lookup after slicing: the same physical path
may legitimately appear in several projects and must remain a distinct shard
candidate for each project context.

## Consequences

- Multi-root project matrices choose the same default shard candidates as Jest.
- Repeated physical paths retain independent project identity and stable order.
- Earlier shards retain Jest's remainder distribution.
- A differential counterexample preserves the previous root-hashing inversion.
- Custom test sequencers and their optional `shard` implementations remain
  separate compatibility work.
