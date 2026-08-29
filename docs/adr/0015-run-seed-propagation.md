# ADR 0015: Generate and propagate one signed run seed

- Status: accepted
- Date: 2026-08-29

## Context

`jest.getSeed()` returns one signed 32-bit value for the complete run. A CLI
seed must be range-checked, while an omitted seed is generated and shared by
every isolated file worker. Generating independently inside workers would make
parallel files observe different values and prevent deterministic ordering.

## Decision

Generate the default seed in the Rust CLI coordinator or validate the explicit
`--seed` value there. Store it in runner options and propagate it through worker
protocol v15. The JavaScript Jest object returns the request value directly.
`--showSeed` prints the same value in the terminal summary.

## Consequences

- All workers in a run observe the same seed.
- Values outside Jest's signed 32-bit range fail before tests start.
- The seed transport is ready for deterministic `--randomize` scheduling, which
  remains separately measured by a known-incompatible differential probe.
