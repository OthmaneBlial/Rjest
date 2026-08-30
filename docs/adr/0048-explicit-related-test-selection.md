# ADR 0048: Treat explicit related-test paths as a distinct selection mode

- Status: accepted
- Date: 2026-08-30

## Context

Jest's `--findRelatedTests` command is commonly used by pre-commit tools such
as lint-staged. Its positional arguments are source paths, not test-path
patterns. Jest resolves the inverse dependency graph from those paths and runs
only the related tests.

This mode differs from changed-file selection in several observable ways:

- it does not require Git;
- omitting the source paths is a CLI error;
- finding no related tests exits unsuccessfully unless `--passWithNoTests` is
  set;
- a supplied test path selects that test directly; and
- coverage is restricted to the supplied source paths, while existing
  `collectCoverageFrom` patterns still constrain that set.

Treating positional paths as ordinary test filters would silently produce the
wrong suite in the pre-commit workflow this option exists to support.

## Decision

Rjest now parses `--findRelatedTests` and its kebab-case alias as a dedicated
selection mode. It resolves every supplied path from the invocation working
directory, discovers the project's complete test set, and uses the existing
resolver-backed dependency graph for direct, transitive, mapped, ESM, and test
path relationships.

The mode takes precedence over configured changed-file selection. Its no-test
result retains Jest's default non-zero exit, while `--listTests` and
`--passWithNoTests` keep their independent Jest semantics.

Coverage uses the supplied in-project paths as both an instrumentation filter
and an explicit zero-hit source set. Test files are excluded from coverage in
the normal way. When `collectCoverageFrom` is configured, Rjest intersects the
configured files with the supplied paths.

## Consequences

- Existing pre-commit commands can replace `jest --findRelatedTests ...` with
  `rjest --findRelatedTests ...` without changing argument meaning.
- Unrelated source files do not accidentally run the full test suite.
- Coverage does not include other modules loaded by a selected test.
- The behavior is protected by official-Jest differential cases for direct,
  transitive, test-path, empty, validation, and coverage outcomes.
- Dynamic imports that cannot be found by the static dependency extractor
  remain part of the broader dependency-graph compatibility backlog.
