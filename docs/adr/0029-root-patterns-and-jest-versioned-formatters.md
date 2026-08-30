# ADR 0029: Normalize root regexes and follow the installed Jest formatter

- Status: accepted
- Date: 2026-08-30

## Context

Jest treats `testPathIgnorePatterns`, `modulePathIgnorePatterns`,
`transformIgnorePatterns`, and `coveragePathIgnorePatterns` as regular
expressions, but it still substitutes every `<rootDir>` token before compiling
them. Rjest previously expanded the token in test globs but not in these regex
arrays. A relative `rootDir: '.'` also retained a lexical `/.` component. In the
styled-components web suite those two defects selected 105 files instead of
Jest's 59, including stress benchmarks that exhausted a 4 GB worker heap.

Snapshot syntax is also coupled to the Jest version that owns Pretty Format.
Jest 30.3 prints `Symbol.for('react.transitional.element')` objects as ordinary
objects, while 30.5 recognizes them as React elements and prints JSX. Always
using Rjest's newest bundled formatter therefore changed an existing inline
snapshot even though the project's installed Jest 30.3 passed it.

## Decision

Lexically normalize absolute roots without resolving symlinks. Globally replace
`<rootDir>` in every supported regex-path option after root normalization,
matching Jest's option normalizer while leaving token-free regexes relative and
otherwise unchanged.

When a project has Jest installed, resolve `@jest/core` from that Jest package
and resolve Pretty Format from the core package's declared dependency graph.
Load it outside the project mock/transform layers. Fall back to Rjest's bundled
Pretty Format when Jest or the dependency path is unavailable. A versioned
Jest 30.3 differential fixture preserves the formatting boundary independently
of the real-project corpus.

## Consequences

- Root-token ignore regexes select the same files as Jest and no longer admit
  excluded benchmarks or platform suites.
- Relative `.` and `..` root components no longer leak into normalized paths.
- Existing snapshots retain the semantics of the project's installed Jest
  formatter, including behavior that changed between Jest 30.3 and 30.5.
- Strict PnP remains valid because `@jest/core` declares Pretty Format; projects
  without Jest continue to use the canonical runner-owned fallback.
- Formatter compatibility is intentionally version-aware rather than assuming
  that the newest formatter is backward-compatible at the byte level.
