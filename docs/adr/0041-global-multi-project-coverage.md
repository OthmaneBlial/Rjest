# ADR 0041: Keep coverage selection global across project roots

- Status: accepted
- Date: 2026-08-30

## Context

Jest separates run-wide coverage controls from each project context. In a
multi-project run, `collectCoverageFrom` is matched relative to the global
root. Each project then contributes matching files from its own Haste map and
uses its own transform and coverage-ignore configuration. The final Istanbul
maps are merged into one report.

Rjest evaluated the same global glob relative to every child project's root.
A common monorepo pattern such as `packages/**/*.js` therefore matched nothing
inside a child already rooted at `packages/alpha`. Imported tests still passed,
but the coverage summary silently contained zero files instead of the imported
and untested files reported by Jest.

Istanbul's package summarizer also has a visible empty-`branchesTrue` edge: a
single source directory keeps the percentage as `Unknown`, while multiple
source directories introduce an aggregate node whose zero-total percentage is
`100`.

## Decision

Use the top-level configuration for `collectCoverage`, `coverageProvider`, and
`collectCoverageFrom`. Match positive and negative source globs from the global
root for every selected project, then retain only files beneath that project's
canonical `roots`. Continue applying the child project's
`coveragePathIgnorePatterns`, test/setup exclusions, transforms, and runtime
resolution.

Merge the resulting per-project Istanbul maps once at the coordinator. When
writing `json-summary`, reproduce Istanbul's package-tree empty
`branchesTrue` percentage according to whether the report contains one or
multiple source parent directories.

## Consequences

- Root-level coverage globs include imported and untested sources across child
  projects without configuration changes.
- Child projects still instrument files through their own Jest transform and
  resolution settings.
- Coverage directories, reporters, providers, and thresholds remain run-wide,
  matching Jest's global configuration boundary.
- The differential fixture proves two project identities, four covered source
  entries, aggregate metric parity, and the nested Istanbul summary edge.
- Source discovery currently walks the global root once per selected project
  so project-specific ignore rules stay correct. A future cache may share the
  global glob candidate set without changing this boundary.
