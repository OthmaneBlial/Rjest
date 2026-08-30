# ADR 0030: Resolve configured transforms inside the project dependency graph

- Status: accepted
- Date: 2026-08-30

## Context

React Navigation's React Native preset configures the bare transformer name
`babel-jest`. Resolving that name from a test file escaped the pnpm project and
found Rjest's own ancestor `node_modules`, mixing Rjest's Babel-Jest and Babel
Core with the project's preset and plugins. Official Jest instead normalizes the
transformer through the Jest installation that owns the project configuration.

The pnpm-generated Jest launcher also adds
`node_modules/.pnpm/node_modules` to `NODE_PATH`. That virtual-hoist directory
contains dependencies needed by the Babel configuration but is absent when the
native Rjest executable is invoked directly.

## Decision

For a bare configured transformer, accept ordinary project resolution only
when the result belongs to the project root or an active Plug'n'Play runtime.
When an escaping transformer is `babel-jest`, resolve the installed `jest`
package, follow its `@jest/core` and `jest-config` dependency chain, and load the
Babel-Jest copy owned by that graph. Retain the existing fallback when no
project Jest installation can provide it.

When a project contains `node_modules/.pnpm/node_modules`, append that path to
the worker's `NODE_PATH` after configured module paths and before any inherited
entries. Do not require the user to launch Rjest through pnpm's generated Jest
wrapper.

## Consequences

- Explicit Babel transforms cannot silently combine an ancestor runner's
  implementation with the project's Babel presets and plugins.
- pnpm virtual-hoisted transformer dependencies resolve under direct native
  Rjest execution.
- Yarn Plug'n'Play remains on its dedicated resolver path.
- Strict pnpm isolated-linker layouts are not implied by this decision and need
  a separate corpus.
- Differential fixtures preserve both the hostile-ancestor and virtual-hoist
  failures independently of React Navigation.
