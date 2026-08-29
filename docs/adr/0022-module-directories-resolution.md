# ADR 0022: Resolve configured module directories with a Rust-backed engine

- Status: accepted
- Date: 2026-08-30

## Context

Jest's `moduleDirectories` option changes more than an environment search path.
Relative directory names are checked at every ancestor of the importing file,
absolute entries are checked once, configured order determines priority, and
omitting `node_modules` must prevent ordinary package lookup. The same contract
applies to CommonJS, transformed modules, mocks, and native ESM with different
package-export conditions.

Setting `NODE_PATH` cannot express these semantics. Delegating to Node's normal
resolver would also leak excluded `node_modules` directories and does not treat
arbitrary directory names as package roots.

## Decision

Normalize `<rootDir>` inside `moduleDirectories` while retaining relative names
and ordered defaults. Carry the list in worker protocol v18.

When the list differs from Jest's single `node_modules` default, resolve bare
runtime specifiers with `unrs-resolver`, the Rust-backed resolution engine also
used by the pinned Jest oracle. Configure it with Rjest's module extensions,
ordered directory entries, project root, environment export conditions, and
separate require/import condition sets. Keep transformer tooling outside this
interception and retain the established Node path for the default configuration.

Route CommonJS resolution, mapped fallback candidates, mock identities, and
native-ESM hooks through the same configured resolver. An unresolved handled
specifier must fail rather than falling back to Node and violating an explicit
directory exclusion.

## Consequences

- Absolute and closest ancestor-relative modules follow Jest lookup priority.
- CommonJS and ESM select their corresponding conditional exports.
- `jest.mock`, `jest.requireActual`, and `require.resolve` share canonical
  identities with ordinary imports.
- Projects can deliberately replace or exclude `node_modules` lookup.
- The native resolver package becomes a direct local development dependency and
  must remain available in the eventual npm distribution dependency tree.
- Custom resolver modules and package-manager-specific PnP bridges remain
  separate compatibility work.
