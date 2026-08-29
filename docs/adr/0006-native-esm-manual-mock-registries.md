# ADR 0006: Load native ESM manual mocks through scratch registries

- Status: accepted
- Date: 2026-08-29

## Context

With automocking enabled, Jest checks a root `__mocks__` entry before the
resolved module's sibling `__mocks__` directory. A root entry may satisfy a bare
specifier that has no real package. The authored manual module must be returned
unchanged rather than passed through automatic metadata generation.

Loading that file is not equivalent to disabling automocking for its graph.
Imports made by the manual module still follow Jest mock decisions, but their
generated instances execute in scratch registries and must not leak into a later
live import. Reset and asynchronous isolation must also receive fresh native ESM
namespaces.

## Decision

Resolve root manual mocks first and then check the exact basename under the
resolved target's sibling `__mocks__` directory. Evaluate the selected manual
module under a fresh URL generation with temporary CommonJS and ESM registries.
Keep automocking active for its dependencies, restore all live mock-entry state
after evaluation, and retain only reusable automatic-mock metadata/factories.

Expose the evaluated authored namespace through the same synthetic ESM export
bridge used by explicit and generated mocks. Retain the manual path as the
entry's factory so `resetModules` and first-use `isolateModulesAsync` loads
evaluate a new scratch generation.

## Consequences

- Static and dynamic imports support sibling and root ESM manual mocks.
- Root mocks win over sibling package mocks and can satisfy unresolvable names.
- Manual exports remain authored functions rather than generated mock functions.
- Dependencies of a manual module are automocked without leaking their scratch
  instances into the live registry.
- `unstable_unmockModule`, `resetModules`, and `isolateModulesAsync` preserve
  Jest's observed manual-mock lifecycle.
