# ADR 0087: Apply CLI Haste and reporter overrides

## Status

Accepted.

## Context

Jest accepts a JSON `--haste` object and repeated `--reporters` values. These
options let React Native-style projects select platform variants and let CI
replace human output with integration-specific reporters. Rjest implemented
both normalized runtime contracts from configuration but rejected the CLI.

An adjacent `extensionsToTreatAsEsm` experiment was not accepted as a fixture:
official Jest 30.5.0 parsed the CLI value as a scalar and failed before running
tests. Compatibility evidence must reproduce a working Jest contract rather
than invent a more permissive one.

## Decision

Parse `--haste` as an object containing only `defaultPlatform` and `platforms`,
validate non-empty platform strings, and replace the normalized Haste object.

Accept repeated reporter names. Replace configured reporters, retain Jest's
built-in names, normalize custom module references from each project root, and
use empty reporter options because the CLI accepts module names rather than
configuration tuples.

Apply both overrides recursively and preserve runtime differential fixtures for
platform resolution and reporter output.

## Consequences

- React Native-style platform selection can be changed per invocation.
- CI can replace reporters without rewriting Jest configuration.
- Unsupported Haste keys fail during argument parsing.
- The CLI category grows from 73 to 75 scenarios, and the complete
  compatibility matrix grows from 270 to 272 scenarios.
