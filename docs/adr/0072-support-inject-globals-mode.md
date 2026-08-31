# ADR 0072: Support injectGlobals mode

## Status

Accepted.

## Context

Jest's default runtime injects suites, tests, hooks, `expect`, and `jest` into
each test environment. Projects can set `injectGlobals: false` and import the
same APIs explicitly from `@jest/globals`, which is common in codebases that
prefer explicit dependencies or enforce no-undef rules.

Rjest already intercepted CommonJS and ESM `@jest/globals` imports, but its
strict configuration loader rejected `injectGlobals`. Its worker also installed
the framework APIs unconditionally.

## Decision

Normalize `injectGlobals` as a project boolean with Jest's `true` default and
carry it over worker protocol v26. When disabled, do not assign framework,
assertion, or Jest-object APIs to the worker or custom-environment globals.
Continue projecting non-framework custom-environment values, and preserve the
module-scoped CommonJS and ESM `@jest/globals` paths.

## Consequences

- Existing projects retain the default injected globals without configuration
  changes.
- Explicit-import projects can run without framework names on `globalThis`.
- Custom environments retain their own projected globals in either mode.
- A permanent differential fixture proves suite, hook, assertion, mock, and
  non-injection behavior against official Jest.
- The Configuration category grows from 48 to 49 scenarios, and the complete
  compatibility matrix grows from 230 to 231 scenarios.
