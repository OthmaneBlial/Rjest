# ADR 0080: Override mock runtime options from the CLI

## Status

Accepted.

## Context

Jest projects frequently enable mock cleanup or module isolation for an entire
CI invocation. Rjest implemented `automock`, `clearMocks`, `resetMocks`,
`restoreMocks`, and `resetModules` from configuration, but rejected their CLI
forms. The mismatch prevented existing scripts from switching runner commands
without editing configuration.

Jest also accepts explicit Boolean values and `--no-*` forms. Those negations
must override enabled project configuration rather than behaving as absent
options.

## Decision

Accept positive, `=true`/`=false`, and negated forms for all five mock-runtime
options. Apply a provided value recursively to every normalized project before
worker requests are created. Preserve the independent lifecycle fields because
clearing usage data, resetting implementations, restoring spies, and resetting
the module registry have distinct observable effects.

Add five positive differential fixtures and one combined negation fixture. The
fixtures compare automatic module mocks, calls, implementations, restored spy
identity, and CommonJS module identity across test boundaries.

## Consequences

- Existing Jest CI scripts can control mock isolation without configuration
  edits.
- Negated flags reliably disable enabled project settings.
- Multi-project runs receive the same invocation-level precedence per child.
- The CLI category grows from 48 to 54 scenarios, and the complete
  compatibility matrix grows from 245 to 251 scenarios.
