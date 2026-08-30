# ADR 0040: Resolve custom test sequencers through the configured resolver

- Status: accepted
- Date: 2026-08-30

## Context

Jest normalizes `testSequencer` after preloading the project's configured
resolver. For each sequencer reference, it asks the resolver for
`jest-sequencer-<name>` first, falls back to ordinary module lookup, then repeats
the process for `<name>`. This applies even when the resolver is an ESM module
with top-level await, provided its eventual export is synchronous.

Rjest normalized both fields independently. Its persistent sequencer bridge
used only `require.resolve`, so a valid Jest project whose resolver mapped a
virtual sequencer name failed before executing any test.

## Decision

Carry the normalized global resolver reference into the persistent sequencer
bridge. Preload it with `require` or awaited `import`, including
`ERR_REQUIRE_ASYNC_MODULE` modules, and accept the same function or `{sync}`
export shapes used by runtime resolution.

Resolve the prefixed and unprefixed candidates in Jest order. Give a synchronous
custom resolver first chance for each candidate with the project basedir and
Jest-shaped `defaultResolver` and `defaultAsyncResolver` callbacks, then try
ordinary project-relative Node resolution. Resolver misses are isolated to the
current candidate, while malformed resolver exports remain explicit errors.

An object that exposes only `async` remains loaded and valid but does not
participate in this synchronous configuration boundary. Jest likewise falls
back to its default synchronous resolver when no `sync` hook exists.

## Consequences

- Virtual or convention-prefixed sequencer packages resolved by project tooling
  work without changing the Jest configuration.
- CommonJS, ESM, and top-level-await initialization are supported before the
  sequencer class is loaded.
- CLI `--testSequencer` overrides still use the configured project resolver.
- A differential fixture proves official Jest and Rjest both select the
  resolver-mapped reverse sequencer and execute the same `ba` file order.
- The bridge still owns only sequencer lookup; module resolution inside test
  workers continues through the richer resolver path recorded in ADRs 0023 and
  0024.
