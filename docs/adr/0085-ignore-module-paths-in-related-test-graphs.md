# ADR 0085: Ignore module paths in related-test graphs

## Status

Accepted.

## Context

Jest accepts `--modulePathIgnorePatterns` and treats matching modules as
invisible to its module map. Rjest normalized this setting from configuration
for static dependency discovery but rejected its CLI form.

Adding the override exposed a deeper mismatch. Rjest omitted matching files
from the scanned module keys, yet its resolver could still retain an edge from
a visible module to an ignored dependency. `--findRelatedTests` therefore
selected a test for a changed path that Jest considered invisible.

## Decision

Accept the array-valued CLI option, replace the configured patterns, expand
`<rootDir>`, and apply the result recursively to every project.

Compile the normalized regexes once per dependency graph. Use them both while
walking module roots and while accepting resolved dependency edges from the
Node resolver bridge. An ignored target must not appear as either a module key
or an edge destination.

Preserve a differential scenario using Jest's `--findRelatedTests` behavior and
the existing transitive dependency fixture.

## Consequences

- IDE and pre-commit related-test selection honors invocation-level ignores.
- Ignored changed paths cannot re-enter the graph through a visible importer.
- Invalid regular expressions keep producing explicit graph-construction
  errors.
- The CLI category grows from 69 to 70 scenarios, and the complete
  compatibility matrix grows from 266 to 267 scenarios.
