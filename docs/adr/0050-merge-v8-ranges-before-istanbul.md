# ADR 0050: Merge V8 ranges before Istanbul conversion

## Status

Accepted

## Context

Jest's V8 coverage provider collects precise ranges in each test worker. The
range shapes for one source file can differ when separate workers execute
different branches. Converting every worker result to Istanbul first produces
different `branchMap` structures that cannot be safely merged by counter key.

The official Jest reporter instead merges raw process coverage with
`@bcoe/v8-coverage`, then runs `v8-to-istanbul` once per merged script. It also
uses transformer source maps when available and synthesizes an empty V8 range
for unexecuted `collectCoverageFrom` sources.

## Decision

Workers start precise V8 collection immediately before the Jest framework
lifecycle and stop it even when the file reports an error. They filter the raw
results through the same source eligibility boundary used by Babel coverage and
return eligible ranges plus transform metadata over worker protocol v25.

The Rust runner gathers every file result and invokes one short-lived Node
coverage bridge. That bridge:

1. merges the raw process coverages;
2. converts each merged script through `v8-to-istanbul`;
3. applies transformer source maps when present;
4. adds zero-hit reports for unexecuted configured sources; and
5. returns one Istanbul map for existing reports and thresholds.

## Consequences

- Multi-worker branch coverage has one stable instrumentation map.
- Babel coverage retains its existing worker instrumentation and Rust counter
  merge path.
- V8 conversion adds one bounded Node process after worker execution.
- The raw ranges are internal protocol data and are removed before public JSON
  result serialization.
- Cross-project combinations that apply different transforms to the same source
  still require broader differential proof.
