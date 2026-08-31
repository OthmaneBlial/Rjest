# ADR 0086: Apply CLI transform and serializer overrides

## Status

Accepted.

## Context

Jest lets automation replace its transform map, transform ignore patterns, and
snapshot serializers from the command line. Rjest already honored all three
from configuration but rejected `--transform`, `--transformIgnorePatterns`,
and `--snapshotSerializers`.

These settings must be applied after project normalization but before worker
requests are created. Root tokens belong to each child project rather than the
coordinator root, and an explicitly empty transform map must suppress the
implicit Babel transform.

## Decision

Parse `--transform` as a JSON object whose entries are transformer module
strings or arrays beginning with a transformer module string. Preserve
transformer options, replace the configured map, expand transformer root
tokens, and set the normalized `transformConfigured` marker.

Accept repeated transform-ignore patterns and serializer modules. Replace
their configured lists and normalize every value from the owning project's
root. Apply all three overrides recursively.

Keep three differential fixtures covering a custom extension transformer, a
dependency excluded from transformation, and exact custom snapshot output.

## Consequences

- Jest scripts and presets can inject transforms without temporary configs.
- Explicit empty transform maps retain Jest's implicit-transform opt-out.
- Serializer loading still occurs after environment setup.
- Invalid transform shapes fail during argument parsing.
- The CLI category grows from 70 to 73 scenarios, and the complete
  compatibility matrix grows from 267 to 270 scenarios.
