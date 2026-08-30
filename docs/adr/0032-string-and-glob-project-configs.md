# ADR 0032: Expand string and glob project configurations before execution

- Status: accepted
- Date: 2026-08-30

## Context

Jest's root `projects` array accepts more than inline objects. A string can name
a project directory, a JavaScript/TypeScript/JSON config file, or a glob that
expands to several such entries. This is common in monorepos and was a direct
replacement blocker because Rjest rejected every string entry.

The anchors differ subtly. A string beginning with `<rootDir>` resolves from the
parent project's normalized root, while an ordinary relative string resolves
from the parent config file's directory. Jest expands matching globs first,
ignores matched non-config files, loads every child independently, and rejects
multiple entries that resolve to the same config path.

## Decision

Resolve each string with the applicable parent anchor, normalize it to an
absolute path, and expand standard path globs with separator-aware matching and
deterministic ordering. Preserve a nonmatching pattern as a path so it produces
a configuration error instead of silently removing a requested project.

Load directories through normal Jest config discovery and load supported config
files explicitly. Child loads ignore their own global `projects` field because
the parent execution matrix already owns expansion. Canonicalize resolved config
paths for duplicate detection and fail before scheduling duplicate projects.

## Consequences

- Existing directory- and config-glob monorepos can retain their original
  `projects` arrays.
- `<rootDir>` and untagged relative entries retain Jest's distinct anchors even
  when the parent config changes its own root.
- A malformed glob cannot recurse through the parent config or silently execute
  the same config twice.
- The measured Configuration denominator includes a mixed directory/glob case
  executed by both official Jest and Rjest.
- Jest-specific extglob combinations beyond the separator-aware standard glob
  subset remain part of the broader custom-glob backlog.
