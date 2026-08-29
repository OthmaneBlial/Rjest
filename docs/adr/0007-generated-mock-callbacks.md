# ADR 0007: Notify generated-mock callbacks at the generation boundary

- Status: accepted
- Date: 2026-08-29

## Context

`jest.onGenerateMock` registers an ordered callback pipeline. Each callback
receives the resolved module path and the previous callback's result. Jest uses
the pipeline for automatic mocks and `createMockFromModule`, but not for manual
`__mocks__` modules or explicit mock factories. Registrations use set semantics
and survive `resetModules`.

Rjest generates CommonJS mocks synchronously from scratch-loaded exports and
native ESM mocks asynchronously from a scratch namespace. Invoking callbacks
during metadata discovery would expose the wrong lifetime and could notify for
modules that are not ultimately served as generated mocks.

## Decision

Keep one worker-local ordered set of callbacks shared by scoped Jest objects.
Run the pipeline only after a fresh mock value has been created, passing the
canonical resolved filesystem path and chaining each callback's return value.

CommonJS `generateAutoMock` notifies after scratch loading and recursive mock
creation. Native ESM stores notification in the retained generation factory, so
the initial import and every reset-created instance notify independently.
Manual-module and explicit-factory branches never enter this boundary.

## Consequences

- Callback order, replacement values, duplicate registration, and Jest-object
  chaining match the differential oracle.
- `createMockFromModule`, configured automocking, and runtime automocking share
  the same callback semantics.
- CommonJS and native ESM reset regeneration notify again without re-evaluating
  the actual metadata source.
- Authored manual mocks and explicit CommonJS/ESM factories do not notify.
