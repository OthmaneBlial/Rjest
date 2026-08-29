# ADR 0004: Prepare asynchronous ESM transforms before native loading

- Status: accepted
- Date: 2026-08-29

## Context

Jest transformers may expose an asynchronous `createTransformer` factory and a
`processAsync` method. ESM import prefers `processAsync` over `process`. Node's
in-process `module.registerHooks` API is synchronous, however, so its `load`
hook cannot await a transformer while a native ESM graph is linking.

Restricting Rjest to synchronous transforms blocks legitimate Jest projects.
Calling an async transformer from the synchronous hook also risks promises
escaping as source code and cannot discover dependencies introduced by the
transformed output.

## Decision

Load configured transformer modules and factories asynchronously before test
execution. ESM transformer modules with top-level await are imported when they
cannot be required synchronously.

Before importing a file-backed ESM entry, transform it asynchronously and scan
the transformed source for static imports and re-exports. Resolve those edges
from their real parent URLs, walk the reachable graph, and prepare every
transformed source in a completed/in-flight cache. Dependencies introduced by a
transform are therefore included. The synchronous Node `load` hook only reads
completed transform results.

Route dynamic `import()` through the existing parent-anchored async bridge and
prepare the newly reachable graph before delegating back to native import.
Prefer `processAsync`; fall back to `process` when it is the only method. Apply
source-map-aware Istanbul instrumentation after either method and use the async
path for `collectCoverageFrom` as well.

## Consequences

- Async-only transformers, async factories, and ESM transformer modules work
  without replacing Node's resolver or native ESM evaluator.
- Static cycles terminate through URL visitation, while concurrent requests for
  one transform share the same in-flight promise.
- Transformed re-exports and newly injected dependencies are prepared before
  the synchronous hook needs them.
- Dynamic import keeps package conditions, mappings, import attributes, and
  parent-relative resolution because native import still performs evaluation.
- Graph preparation adds resolution work before first import. Persistent Jest
  transformer cache-key semantics remain separate future work.
