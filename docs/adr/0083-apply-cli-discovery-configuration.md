# ADR 0083: Apply CLI discovery configuration

## Status

Accepted.

## Context

Jest exposes its core discovery fields on the command line so IDEs, CI jobs,
and focused scripts can change the scanned roots and test predicates without
editing a configuration file. Rjest normalized `testMatch`, `testRegex`,
`testPathIgnorePatterns`, and `roots` from configuration but rejected their CLI
forms.

The values have project-local semantics. In particular, a relative root in a
multi-project run belongs to each child's `rootDir`, not the coordinator root.

## Decision

Accept array-valued CLI forms for all four fields and apply provided values
recursively. Replace configured arrays instead of appending. Expand
`<rootDir>` in patterns and resolve relative roots against the owning project.

When CLI `testRegex` replaces Jest's default `testMatch`, remove the default
globs. Retain validation for a genuinely configured custom `testMatch` and
`testRegex` combination. Add one differential fixture per option and a Rust
multi-project normalization test.

## Consequences

- Tooling can change discovery without generating temporary Jest configs.
- Project children resolve the same CLI spelling independently and correctly.
- Invalid mixed custom match/regex strategies remain explicit errors.
- The CLI category grows from 60 to 64 scenarios, and the complete
  compatibility matrix grows from 257 to 261 scenarios.
