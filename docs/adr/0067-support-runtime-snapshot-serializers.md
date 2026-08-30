# ADR 0067: Support runtime snapshot serializers

## Status

Accepted.

## Context

Jest exposes `expect.addSnapshotSerializer()` so a test file or setup module can
register a pretty-format plugin without changing project configuration. The
method returns `undefined`, prepends each plugin, and therefore tests the most
recently registered serializer first. This surface is common in React snapshot
suites and supports both legacy `test`/`print` plugins and modern
`test`/`serialize` plugins.

Rjest already loaded serializers from the `snapshotSerializers` configuration
field, but its global `expect` object did not expose the runtime registration
method. Existing suites failed before reaching their first snapshot assertion.

## Decision

Expose `expect.addSnapshotSerializer(serializer)` in every isolated test
worker. Registration prepends the plugin to the worker-local serializer list
and returns `undefined`, matching Jest's `jest-snapshot` implementation. The
existing pretty-format integration remains responsible for plugin selection,
recursive printing, and support for both serializer contracts.

## Consequences

- Test files and setup modules can register serializers without configuration
  changes.
- The last registered plugin wins when multiple serializers accept a value.
- Legacy recursive `print` and modern `serialize` plugins use Jest's installed
  pretty-format implementation.
- Serializer state remains isolated with the test worker and cannot leak into
  another file.
- A permanent three-test differential fixture covers return value, priority,
  legacy recursion, and modern recursive printing.
- The Snapshots category grows from 15 to 16 scenarios, and the complete
  compatibility matrix grows from 225 to 226 scenarios.
