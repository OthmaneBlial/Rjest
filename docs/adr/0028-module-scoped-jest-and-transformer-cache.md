# ADR 0028: Bind Jest per CommonJS module and isolate transformer caches

- Status: accepted
- Date: 2026-08-30

## Context

Jest compiles CommonJS with an additional `jest` wrapper parameter. Every
module therefore receives a stable Jest object whose resolver methods are bound
to that module's filename. A process-wide global can appear equivalent at module
load time but fails when an exported function later calls `jest.requireActual`,
`jest.mock`, or another path-sensitive API from a different caller. React
Native's Jest preset relies on this behavior deliberately.

Rjest also needs transformer dependencies to remain separate from the test
module registry. Deleting every module loaded by a transformer after every
source preserves isolation, but it forces Babel configurations and plugins to
reload repeatedly. Granite's React Native graph turned that policy into multi-GB
memory use and file-level timeouts.

Strict Yarn PnP adds a third ownership boundary: Pretty Format, Babel source
rewriting tools, Istanbul instrumentation, and the native resolver belong to
Rjest. A test project must not declare Rjest's implementation dependencies just
to use snapshots or coverage.

## Decision

For CommonJS output that references the `jest` binding, compile through
`vm.compileFunction` with Node's standard module parameters plus a final
module-scoped `jest` parameter. Cache the scoped Jest object by normalized
filename and bind path-sensitive methods and chain-returning methods to it.
Continue using Node's native `_compile` path for output that cannot observe the
extra binding, retaining Node's loader behavior and fast path for the majority
of modules.

Maintain a dedicated CommonJS module cache for transformer initialization,
synchronous transforms, asynchronous transforms, source-map helpers, and
fallback instrumentation. Swap that cache in only while transformer code runs,
then restore the test runtime cache. Transformer dependencies can therefore be
reused across source files without leaking modules preloaded by a transformer
into test execution.

Pass canonical paths for Rjest-owned JavaScript tools through the versioned
worker protocol. Resolve and load those paths while the project resolver and
mock layers are bypassed, so strict PnP cannot reinterpret them as undeclared
project dependencies.

## Consequences

- Exported functions resolve Jest module APIs relative to their defining module,
  matching Jest and the React Native preset.
- `@jest/globals` and the injected CommonJS binding share a stable per-module
  object and preserve chaining identity.
- Transformer-loaded source modules remain invisible to tests, while expensive
  Babel/plugin dependencies are reused inside a worker.
- Strict PnP projects can use Rjest snapshot formatting, inline snapshot
  rewriting, coverage fallback instrumentation, and resolution without adding
  Rjest's private packages to their manifests.
- Native `_compile` remains the default for modules with no observable Jest
  binding. The selective compilation rule is retained by differential tests and
  real React Native corpus evidence.
