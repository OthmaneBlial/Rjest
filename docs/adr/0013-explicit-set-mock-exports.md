# ADR 0013: Store setMock values as explicit CommonJS factories

- Status: accepted
- Date: 2026-08-29

## Context

`jest.setMock(moduleName, moduleExports)` supplies the exact exports that future
CommonJS mock resolution should return. It is caller-relative, replaces an
earlier mock factory, supports non-object exports, and returns the calling Jest
object. The registration survives `resetModules`, and because the supplied value
is already evaluated, its identity survives as well.

## Decision

Represent a setMock registration as the existing explicit CommonJS mock entry
with a factory that returns the captured supplied value. Register it through the
same caller-relative path used by `mock`/`doMock`, from both global and scoped
Jest objects.

Keep the value factory in registry state while reset clears only its initialized
flag. Continue to let `unmock` delete the registration and let `requireActual`
bypass it.

## Consequences

- Object and primitive exports are returned exactly as supplied.
- `require` and `requireMock` share the injected value; `requireActual` remains
  real.
- Later setMock registration replaces an earlier factory for the same identity.
- Module reset re-enters the captured factory and returns the same supplied
  identity.
- Scoped Jest objects resolve relative names from the declaring module.
