# ADR 0046: Reuse the native dependency graph for one-shot changed selection

- Status: accepted
- Date: 2026-08-30

## Context

Jest users invoke changed-test selection outside watch mode in local scripts and
CI with `-o`/`--onlyChanged`, `--lastCommit`, `--changedSince`, and
`--changedFilesWithAncestor`. These modes share the affected-test graph with
`--watch`, but differ in their Git query, option precedence, non-SCM behavior,
and zero-test exit contract. Treating them as aliases for path filtering would
miss transitive dependencies and break existing Jest commands.

## Decision

Extend `rjest-dependency` with explicit Git range options and reuse the same
resolver-backed inverse dependency graph used by native watch selection.

- Default changed selection reads staged, modified, deleted, and untracked
  files.
- `--lastCommit` reads the paths recorded by `HEAD` and takes precedence over
  other ranges.
- `--changedSince=<revision>` combines the triple-dot revision range with
  staged and working-tree changes.
- `--changedFilesWithAncestor` uses `HEAD^` as the range base and includes the
  working tree.
- `--all` disables configured changed and failed-only selection. A positional
  test path disables one-shot `onlyChanged`, while `--watch` retains its related
  selection behavior.
- A one-shot changed run outside Git returns a successful empty result. Human
  diagnostics use stderr so `--json` remains machine-readable. `--watch`
  retains its Jest-compatible non-SCM failure and `--watchAll` guidance.

The normalized Jest-shaped global config exposes the effective selection and
range fields to reporters, hooks, and result processors.

## Consequences

- Existing Jest commands can select related CommonJS, native ESM, mapped, and
  transitive dependants without rewriting test paths.
- The same conservative fallback used by watch mode prevents false negatives
  when dependency resolution cannot be completed safely.
- Git remains the only implemented SCM adapter. Mercurial and Sapling are not
  claimed.
- Changed-file-aware coverage collection is a separate compatibility surface;
  this decision covers test selection and execution scope.

Rust tests protect Git range semantics and CLI precedence. Seven isolated
official-Jest differential scenarios protect the end-to-end command behavior,
including configuration overrides and JSON output outside source control.
