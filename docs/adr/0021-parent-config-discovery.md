# ADR 0021: Traverse package boundaries during implicit config discovery

- Status: accepted
- Date: 2026-08-30

## Context

Jest does not assume that the process working directory is the project root.
Developers commonly invoke it from a nested workspace directory, editor task,
or package script. Jest searches upward for its ordered config filenames and
also treats `package.json` as a root marker even when that package has no
`jest` field.

Using only the invocation directory caused Rjest to miss tests and configuration
in ordinary repositories. Searching all the way through a nested package would
be wrong as well: the nearest package marker deliberately prevents an ancestor
monorepo config from taking ownership of that package.

## Decision

For implicit configuration, search each directory from the invocation path
toward the filesystem root. At each level, inspect Jest's ordered config names
and a package `jest` value, retaining the existing multiple-config error. A
config wins over a package that merely acts as a root marker. If no config is
present, stop at the nearest `package.json` and normalize Jest defaults from
that directory.

Fail when the traversal reaches the filesystem root without finding either a
config or package marker. Explicit file and inline JSON configuration continue
to bypass implicit traversal.

## Consequences

- Running Rjest below a project config discovers the same root and test files
  as Jest.
- Nested packages are isolated from unrelated ancestor Jest configuration.
- Repositories without a Jest config can still use Jest defaults when they have
  a package root.
- Bare filesystem directories without either marker now report a configuration
  error, matching Jest instead of silently creating an implicit project.
