# ADR 0078: Override test environments from the CLI

## Status

Accepted.

## Context

React and browser-oriented Jest suites often switch environments for a focused
invocation with `--env=jsdom` or `--testEnvironment=jsdom`, optionally passing
`--testEnvironmentOptions` as JSON. Rjest supported the same values in
configuration but rejected all three CLI forms.

The first strict fixture also exposed an older built-in JSDOM difference:
official Jest makes `window`, `self`, and `globalThis` the same public object,
while Rjest returned the underlying JSDOM Window from its aliases.

## Decision

Accept both Jest environment flag names plus a hyphenated alias. Validate the
options argument as a JSON object at CLI parsing time, normalize path-like
environment references from each project root, and apply both values
recursively to child projects.

Keep the underlying JSDOM Window for browser implementations and live getters,
but project public `window` and `self` aliases back to the worker global. Map an
assignment of that worker global back to the underlying Window so existing live
binding behavior is preserved.

Add two differential CLI scenarios, one for each Jest flag name, that replace a
configured Node environment with JSDOM and verify DOM availability plus the
exact configured URL. Strengthen the existing JSDOM environment fixture with
strict `window === self === globalThis` assertions.

## Consequences

- Common Jest commands can switch Node and JSDOM without configuration edits.
- Invalid non-object environment options fail during argument parsing.
- React/browser code sees Jest-compatible global identity and retains live
  JSDOM document, storage, constructor, and timer behavior.
- The CLI category grows from 42 to 44 scenarios, and the complete
  compatibility matrix grows from 239 to 241 scenarios.
