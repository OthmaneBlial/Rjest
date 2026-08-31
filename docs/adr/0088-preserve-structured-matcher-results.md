# ADR 0088: Preserve structured matcher results

## Status

Accepted.

## Context

Jest attaches a `matcherResult` object to assertion errors. Integrations can
inspect the matcher outcome, message, and selected values without parsing
formatted terminal output. Rjest previously threw an error containing only a
message, so an official Jest regression test passed while the equivalent Rjest
fixture observed `undefined`.

## Decision

Attach a structured result to failed built-in and custom matcher assertions.
Every built-in result retains the rendered message and the matcher's positive,
pre-negation `pass` value. `toBe`, `toEqual`, and `toStrictEqual` additionally
retain Jest's `actual`, `expected`, and `name` fields. Custom matcher results are
copied intact and their message callback is replaced by the evaluated string.

Keep a differential fixture for positive equality failure metadata, a negated
failure, and custom matcher fields.

## Consequences

- Reporter and framework integrations can inspect failed assertions without
  scraping Rjest output.
- Negated failures retain the underlying matcher result, matching Jest.
- The Expect category grows from 14 to 15 scenarios, and the complete
  compatibility matrix grows from 272 to 273 scenarios.
