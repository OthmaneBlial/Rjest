# ADR 0045: Own changed-test selection in Rust with a resolver bridge

- Status: accepted
- Date: 2026-08-30

## Context

Jest's default `--watch` mode does not rerun every suite. It asks the active
source-control adapters for changed files and traverses the inverse module graph
to select related tests. Correct selection must include staged, modified,
deleted, and untracked paths; direct test changes; snapshot ownership; transitive
imports; module mappings; and project-specific resolution. A missed dependency
is worse than an extra suite because it can hide a failure during development.

Rjest already owned native recursive filesystem watching, discovery, project
selection, and scheduling. Aliasing `--watch` to `--watchAll` would keep tests
correct but violate Jest's scope and responsiveness contract. Moving the entire
graph into JavaScript would also surrender a coordinator responsibility that is
well suited to deterministic Rust data structures.

## Decision

Add `rjest-dependency` as a workspace crate. Rust discovers configured module
files, queries each distinct Git repository for staged and working-tree changes,
stores the resolved adjacency map, and performs deterministic inverse transitive
traversal for each selected Jest project context.

A short-lived Node bridge extracts Jest-style static `import`, `export`,
`require`, dynamic `import`, and selected `jest.*` dependency forms. It resolves
each edge with ordered `moduleNameMapper` replacements, configured extensions,
module directories and paths, platform suffixes, the packaged resolver engine,
or a synchronous custom resolver. Built-in and unresolved modules do not create
graph edges. Snapshot paths under `__snapshots__` map directly to their owning
test file.

The graph is rebuilt before the initial watch run and after each debounced change
batch. If a configured custom resolver exposes only an asynchronous hook, Rjest
selects every discovered test in that context rather than risk a false negative.
Outside Git, `--watch` exits with guidance to use `--watchAll`, matching Jest's
control flow while accurately leaving Mercurial and Sapling support unclaimed.

## Consequences

- `--watch` now selects direct and transitive CommonJS/ESM dependants, including
  mapped modules, added/deleted tests, and clean-tree empty runs.
- Rust remains responsible for SCM aggregation, graph ownership, project
  identity, traversal, and final suite filtering; Node is limited to JavaScript
  dependency extraction and ecosystem-compatible resolution.
- Rebuilding the complete graph favors correctness over latency for the first
  implementation. Persistent dependency metadata and incremental invalidation
  remain performance work.
- Static extraction follows Jest's haste-model boundary and does not attempt to
  infer computed runtime imports.
- Interactive watch keys, cancellation of stale active runs, Mercurial, Sapling,
  and watch plugins remain separate compatibility milestones.

The behavior is protected by Rust unit tests and long-lived differential
process fixtures against official Jest.
