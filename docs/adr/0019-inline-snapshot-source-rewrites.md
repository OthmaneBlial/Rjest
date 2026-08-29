# ADR 0019: Rewrite inline snapshots in the isolated JavaScript worker

- Status: accepted
- Date: 2026-08-30

## Context

Matching an existing inline snapshot only compares a runtime value with a
string already present in source. Writing a missing snapshot or updating a
mismatch additionally requires locating the exact matcher invocation in the
original file, even when a Jest transformer changed its generated line and
column positions. Text search is unsafe because snapshot calls can repeat,
appear in comments and strings, or contain nested JavaScript expressions.

The worker already owns transformer output, source maps, runtime stack frames,
snapshot serialization, and retry-attempt state. Sending only a guessed byte
offset to Rust would discard the information needed to make the edit safely.

## Decision

Capture a V8 error stack when an inline matcher is called. When an update is
accepted, retain the test-file frame and serialized snapshot in the attempt's
snapshot journal. Failed retry attempts remove their queued inline writes.

At the end of a successful file run, remap generated coordinates through the
transformer's source map with `@jridgewell/trace-mapping`. Parse the original
JavaScript or TypeScript source with Babel, locate the call whose matcher
property starts at that exact line and column, replace an existing string or
template argument or append a new template literal, and regenerate only that
call expression. Apply replacements from the end of the file toward the start
and escape backticks, backslashes, and interpolation markers using Jest's
template-literal rules.

Keep external `.snap` persistence in Rust. Inline source writes stay in the
isolated JavaScript worker because that process has the authoritative runtime
frame, transformer map, and syntax tooling.

## Consequences

- Source writes are tied to executed matcher callsites rather than textual
  guesses and work through Babel transforms.
- Multiple writes at the same callsite fail explicitly, matching Jest.
- CommonJS, JavaScript, TypeScript, and native ESM files share one update path.
- A killed worker cannot apply a queued inline rewrite after a bail boundary.
- The Babel-only rewrite remains the fallback when project Prettier is disabled
  or unavailable; configured formatting is specified separately in ADR 0020.
