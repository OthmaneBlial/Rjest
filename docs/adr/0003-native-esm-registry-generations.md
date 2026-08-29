# ADR 0003: URL generations for resettable native ESM registries

- Status: accepted
- Date: 2026-08-29

## Context

Node's native ESM cache does not expose an eviction API. Jest's `resetModules`
creates a fresh ESM registry: actual modules evaluate again, retained mock
factories run again, and references obtained before the reset keep their old
module state. Clearing CommonJS `Module._cache` alone cannot provide this
behavior.

Jest also separates an active mock decision from an evaluated mock instance.
`unstable_unmockModule` restores the actual module, but re-registering the same
mock can still reuse its previously evaluated instance until `resetModules`
clears the registry.

## Decision

Track a monotonic native-ESM registry generation in each Rjest file worker.
After `resetModules`, append that generation as an internal query parameter to
every file URL returned by the synchronous resolve hook. Apply the same value to
mapped roots and their static dependency graph, so Node constructs one coherent
fresh graph while preserving its normal resolver and module-cache behavior.

Keep active ESM mock registrations separate from the evaluated mock cache.
Unmocking removes the active decision without deleting an evaluated instance;
resetting clears evaluated instances and marks retained registrations
uninitialized so their factories run in the new generation.

For `isolateModules` and `isolateModulesAsync`, activate a unique temporary URL
generation and an evaluated-mock overlay while retaining the outer generation
and cache. A first-use mock writes only to the overlay; an instance already
evaluated outside remains visible inside, matching Jest's cascading registry.
Restore the outer CommonJS cache, ESM generation, and mock state in `finally`.

## Consequences

- Actual ESM modules and their dependencies re-evaluate after `resetModules`.
- Existing namespace references remain valid and retain their pre-reset state.
- Relative, package, built-in, mapped, transformed, and mocked imports continue
  through the same loader path.
- Internal generation parameters are never part of compatibility identities;
  filesystem paths, transform caches, and coverage paths remain canonical.
- Successive isolated registries never reuse a Node ESM URL generation or mock
  data URL, while outer namespace references and evaluated mocks survive.
- Async isolation keeps the temporary CommonJS cache active across awaits and
  restores every registry after success or callback failure.
- Calling `resetModules` inside an isolation exits its overlays, clears the
  outer registries, and promotes the post-reset generation to the main registry,
  matching Jest's observed lifecycle.
