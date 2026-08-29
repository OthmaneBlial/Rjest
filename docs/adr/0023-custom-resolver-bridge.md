# ADR 0023: Preload synchronous Jest custom resolvers in each worker

- Status: accepted
- Date: 2026-08-30

## Context

Jest projects use the `resolver` configuration option to map virtual package
names, alter package selection, and bridge nonstandard layouts. A resolver may
be CommonJS or ESM, may use top-level await while initializing, and receives
Jest's default resolver functions plus the active basedir, conditions,
extensions, module directories, module paths, and project root.

CommonJS loading and Node's in-process ESM customization hook both require a
synchronous answer. Loading an ESM resolver lazily from either path is unsafe,
especially when its module contains top-level await.

## Decision

Normalize the configured resolver reference and carry it with module paths in
worker protocol v19. Before configuring transforms or loading user code, load
the resolver with `require` or awaited `import`. Accept a function export or an
object with `sync`; retain an `async` export for future asynchronous graph work.

Invoke the synchronous resolver for runtime source specifiers and pass
Jest-shaped options. Implement `defaultResolver` and `defaultAsyncResolver`
callbacks on the same Rust-backed resolution engine used for configured module
directories, preserving require/import condition sets and module-path fallback.
Route returned canonical paths through existing CommonJS mock identities and
native-ESM hooks.

Rjest's private versioned entry and dynamic-import bridge `file:` URLs bypass
the user resolver. They are transport artifacts, not source specifiers visible
to Jest resolvers. The bypass is scoped to configured-resolver workers so the
existing default ESM registry-generation path is unchanged.

## Consequences

- CommonJS and top-level-await ESM resolver modules initialize before the first
  user resolution.
- Function and `{sync}` export shapes work for CommonJS, mocks,
  `jest.requireActual`, static ESM, and dynamic ESM.
- Custom resolvers can delegate unchanged requests through familiar Jest
  default callbacks.
- Async-only resolver exports are awaited by ESM graph preparation and cached
  for the synchronous Node hook; CommonJS intentionally falls back to default
  sync resolution when no `sync` export exists.
- Some less common mutable default-resolver options need additional oracle
  fixtures before broad custom-resolver compatibility can be claimed.
