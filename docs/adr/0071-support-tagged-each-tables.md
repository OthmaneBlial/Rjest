# ADR 0071: Support tagged each tables

## Status

Accepted.

## Context

Jest accepts both array data and tagged-template tables for `test.each`,
`describe.each`, and their chained variants. Tagged tables declare named
columns and pass one object per data row, allowing test names to interpolate
values such as `$expected`, nested paths such as `$meta.label`, and `$#` row
indices.

Rjest treated a template strings array as an ordinary list of rows. It produced
one invalid declaration per string fragment, discarded the interpolated values,
and left every named placeholder unresolved. `test.concurrent.each` therefore
also scheduled the wrong number of tests.

## Decision

Normalize tagged-template input before binding an `each` declaration. Rebuild
the table with collision-resistant value markers, split its heading and data
rows, and resolve every exact marker back to the original JavaScript value.
Pass the resulting named row objects through the existing name interpolation
and declaration paths.

Use the same binder for suites and tests, including `only`, `skip`, and
concurrent chains, so array tables retain their existing behavior while tagged
tables share one implementation.

## Consequences

- Named tagged rows now reach callbacks as objects across tests and suites.
- `$column`, nested `$path`, and `$#` names are resolved by the existing Jest
  name interpolation path.
- Tagged `test.concurrent.each` rows participate in real bounded concurrency.
- A permanent seven-test differential fixture covers ordinary tests, nested
  suites, and overlapping concurrent rows.
- The Core API category grows from 15 to 16 scenarios, and the complete
  compatibility matrix grows from 229 to 230 scenarios.
