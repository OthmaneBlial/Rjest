# ADR 0081: Enforce Jest CI snapshot policy

## Status

Accepted.

## Context

Official Jest prevents new snapshots from being written in continuous
integration unless snapshot updates are explicitly requested. Rjest always used
the local `new` snapshot mode, rejected `--ci`, and ignored a truthy `CI`
environment. A suite could therefore pass under Rjest while silently creating a
snapshot that Jest would reject in CI.

Jest also allows `--ci=false` to override an automatically detected CI
environment, and `--updateSnapshot` must remain explicit authorization to write.

## Decision

Accept `--ci` as an optional Boolean and detect the standard CI environment
signals used by common providers. Resolve snapshot policy in this order:

1. `--updateSnapshot` selects `all`.
2. An explicit `--ci` or `--ci=false` controls CI mode.
3. Otherwise, CI environment detection selects `none`; local execution selects
   `new`.

Expose the same resolved values through custom reporter global configuration.
Add three differential fixtures that compare test status and snapshot files for
explicit CI, environment CI, and the explicit false override.

## Consequences

- Rjest no longer creates unreviewed snapshots in CI.
- Local snapshot creation remains unchanged.
- CI detection is deterministic in the differential harness for both runners.
- The CLI category grows from 54 to 57 scenarios, and the complete
  compatibility matrix grows from 251 to 254 scenarios.
