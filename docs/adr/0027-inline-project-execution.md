# ADR 0027: Normalize and execute inline Jest projects independently

- Status: accepted
- Date: 2026-08-30

## Context

Jest's root `projects` option is an execution matrix, not a list of extra roots.
The same physical test file can run repeatedly with different dependency
mappings, transforms, environments, setup modules, snapshot behavior, and
display names. Flattening the projects into one discovery set would silently
run fewer tests with the wrong runtime state. Apollo Client relies on this
contract for three Core dependency variants and three React versions.

Project roots also have a subtle boundary: `<rootDir>` in an inline child is
anchored at the parent config directory, while an ordinary relative child root
is resolved from the invocation directory. Positional CLI paths begin at that
invocation directory and still need to satisfy each project's test patterns.

## Decision

Normalize inline object entries recursively into complete `ProjectConfig`
values. Keep each child independent and have the Rust CLI discover, shard, and
execute its file set with a project-specific runner configuration. Attach the
child display name during coordinator aggregation, preserve duplicate physical
paths in execution results, and merge coverage through the runner's validated
Istanbul aggregation path. Apply run-wide bail to the cumulative result.

Resolve existing positional paths once from the invocation directory before
project discovery. In list mode, deduplicate canonical paths because official
Jest lists a shared file once even when multiple projects would execute it.

Load a configured preset before normalizing a project. Preset setup arrays are
prepended, mapping and transform objects are merged with explicit project values
winning, and ordinary unset fields inherit from the preset.

String project paths and globs initially remained rejected rather than being
treated as inline configs or silently ignored. ADR 0032 extends this decision
with explicit path expansion and child-config loading semantics.

## Consequences

- One source file can execute under multiple dependency and React-version
  mappings without leaking resolver, transformer, environment, or snapshot
  state between projects.
- Result JSON can distinguish duplicate suite paths through the project display
  name added by the coordinator.
- Differential fixtures preserve duplicate execution, list-mode deduplication,
  child-root CLI semantics, and preset inheritance against official Jest.
- Cross-project parallel scheduling, display colors, duplicate-path shard
  identity, and the broader reporter/coverage edge surface remain explicit
  follow-up work.
