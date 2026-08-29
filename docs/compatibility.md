# Jest compatibility

Compatibility is tracked in the machine-readable
[`compat/jest-compatibility.json`](../compat/jest-compatibility.json) matrix.
Counts come only from executable Rust and Jest/Rjest differential tests;
placeholders are never counted. The differential harness normalizes test names,
statuses, files, and exit codes while deliberately ignoring timing and cosmetic
output differences.

The current alpha supports normalized JSON/package configuration, native
discovery, isolated JS and basic TS execution, nested hooks, async tests, common
matchers, basic function/method mocks, and external Jest v1 snapshots. Inline
snapshots, snapshot property matchers/custom serializers, module mocks, complete
resolution/config semantics, fake timers, coverage, watch mode, and browser
environments remain missing, so Rjest does not claim broad or drop-in Jest
compatibility yet.

Run the oracle locally with `npm run compat`; `make check` includes it.
