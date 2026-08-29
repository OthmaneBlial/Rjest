# ADR 0005: Generate native ESM automocks from scratch registries

- Status: accepted
- Date: 2026-08-29

## Context

Jest automocking derives mock functions, classes, objects, arrays, and primitive
exports from the evaluated shape of the actual module. Native Node ESM exposes
that shape only after evaluation, but evaluating the actual module in the live
registry would leak its namespace and side effects into later unmocked imports.

The synchronous Node resolver hook must also know a synthetic mock URL before a
statically imported graph links. Dynamic imports, packages, resettable module
registries, and `isolateModulesAsync` must share the same decision semantics.

## Decision

Resolve each automock decision to a canonical module identity. During async ESM
graph preparation, evaluate the actual module with ESM mocking bypassed and a
unique temporary URL generation. This scratch native graph cannot populate the
live registry. Recursively generate Jest-style mock values from the resulting
namespace and expose them through the existing synthetic data-URL module path.

Retain the evaluated actual namespace as metadata behind a factory that creates
a fresh mock value. Keep the generated mock instance in the same overlay-aware
cache used by explicit ESM mocks. Explicit factories win over automocking;
`unstable_unmockModule` records a canonical negative decision. Reset and
isolation clear or overlay instances while retaining metadata and decisions.

## Consequences

- Static and dynamic relative/package imports can be automocked before Node
  links their native graph.
- Default/named functions, classes, nested methods, arrays, and primitives use
  the same recursive mock generator as CommonJS automocking.
- Actual metadata evaluation has an isolated URL generation, so a later unmocked
  import evaluates in the live registry.
- Reset creates a new mock instance without reusing prior mock state; first-use
  instances created in an isolation do not leak out.
- Sibling/root ESM manual mocks and generated-mock callbacks remain separate
  compatibility work.
