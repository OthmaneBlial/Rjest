# ADR 0009: Share property replacement and spy restoration

- Status: accepted
- Date: 2026-08-29

## Context

`jest.replaceProperty` replaces configurable value properties without turning
them into mock functions. It searches the prototype chain, reuses a handle for
repeated replacement of the same target/key pair, and must restore inherited
properties by deleting the temporary own value. `restoreAllMocks` restores both
spies and replacements, while `clearAllMocks` and `resetAllMocks` leave replaced
values intact.

## Decision

Track active replacements in a weak target registry keyed by property key. Each
replacement handle owns `replaceValue` and an idempotent `restore` closure. Add
that closure to the existing worker restoration set used by spies, and remove
both registrations when it restores.

Match Jest's descriptor validation before registration: reject primitives,
missing keys, nonconfigurable properties, accessors, and function values. Use
ordinary assignment for replacement/restoration and delete the temporary own
property when the original descriptor came from a prototype.

## Consequences

- Own, inherited, number-keyed, and symbol-keyed properties share one behavior.
- Repeated calls return the same active handle and restore the original value.
- `restoreAllMocks` handles mixed spies and replaced properties atomically.
- Manual restore is idempotent and allows a later call to create a fresh handle.
- Clear/reset mock-state APIs do not restore property values.
