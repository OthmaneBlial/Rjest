# ADR 0084: Apply CLI module-resolution overrides

## Status

Accepted.

## Context

Jest exposes module lookup and mapping configuration on the command line so
editors, build systems, and migration scripts can change resolution without
writing a temporary config. Rjest already implemented the normalized runtime
contracts for these fields but rejected their CLI forms.

The values are project-local. A `<rootDir>` token, relative module path, mapper
replacement, or custom resolver in a multi-project invocation belongs to each
child project's root. Jest also executes a JavaScript-like custom suffix listed
in `moduleFileExtensions` as CommonJS when no transform owns the file.

## Decision

Accept `--moduleDirectories`, `--modulePaths`, `--moduleFileExtensions`,
`--moduleNameMapper`, and `--resolver`. Provided values replace configuration
and are normalized recursively from each owning project. Validate the mapper as
a JSON object whose values are strings or non-empty string arrays.

Register configured non-native extensions with the worker loader. When neither
a transform nor an existing extension hook claims such a file, compile its
source through the same CommonJS boundary as `.js` and `.cjs`.

Add one official-Jest differential fixture per option and a Rust multi-project
normalization test.

## Consequences

- Existing scripts can override common resolution settings without config
  rewrites.
- Child projects interpret root-relative values independently.
- Invalid mapper shapes fail during argument parsing.
- Custom JavaScript-like extensions follow Jest when no transform is present.
- The CLI category grows from 64 to 69 scenarios, and the complete
  compatibility matrix grows from 261 to 266 scenarios.
