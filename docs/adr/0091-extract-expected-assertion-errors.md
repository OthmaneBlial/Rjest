# ADR 0091: Extract expected assertion errors

## Status

Accepted.

## Context

Jest exposes `expect.extractExpectedAssertionsErrors()` for its runner and for
integrations that consume Expect state. It returns pending exact-count and
at-least-one assertion failures, then resets the local counters and contracts.
Rjest enforced those contracts only at the end of its own test lifecycle and
did not expose the extraction API. It also accepted arguments to
`expect.hasAssertions()` that Jest rejects.

## Decision

Capture an `Error` when `expect.assertions()` or `expect.hasAssertions()`
declares a contract. Implement one-shot extraction that formats Jest-shaped
entries with `actual`, `expected`, and the captured error, then resets both the
public Expect state and the active test's assertion fields.

Reject arguments passed to `expect.hasAssertions()`. Preserve a differential
fixture for mismatched exact counts, missing assertions, a satisfied contract,
state reset, error identity, and argument validation.

## Consequences

- External runner integrations can consume assertion-contract failures through
  the same public API as Jest.
- Extracted contracts are not reported a second time at test completion.
- Declaration stack identity is retained through the captured error object.
- The Expect category grows from 17 to 18 scenarios, and the complete
  compatibility matrix grows from 275 to 276 scenarios.
