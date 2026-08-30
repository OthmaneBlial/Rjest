# ADR 0043: Keep global setup and teardown in one persistent Node process

- Status: accepted
- Date: 2026-08-30

## Context

Jest runs `globalSetup` after final test selection and before scheduler/reporter
creation, then runs `globalTeardown` after the scheduled run. Only projects
that still own selected tests contribute hooks, and identical resolved hook
paths execute once. Setup and teardown can be asynchronous, CommonJS, ESM, or
transformed project modules. They receive the run-wide global config and the
project config associated with the resolved hook.

Rjest's test files execute in isolated Node processes. Running each global hook
in a separate one-shot process would lose module/global state needed by
teardown and would prevent setup-created resources from being cleaned up by the
same process. Mutating the Rust coordinator's process environment after worker
threads exist would also be unsafe.

## Decision

The Rust coordinator computes ordered, path-deduplicated setup and teardown
entries from the already filtered, sharded, and sequenced project runs. A
persistent `global-hooks.mjs` child loads and awaits every setup before custom
reporters or test workers start, then remains alive until it receives the final
teardown command.

The bridge loads native CommonJS and ESM modules, accepts default exports, and
uses the owning project transform configuration for transformed hook sources.
It reports hook errors through a prefixed JSON line protocol while ordinary
hook stdout is forwarded unchanged.

The bridge snapshots its initial environment and returns only additions,
changes, and removals made by setup. Rust attaches that delta explicitly to
reporter and worker `Command` instances. The coordinator does not mutate its
own global environment. Setup and teardown retain one Node process, module
cache, global object, and environment.

## Consequences

- Async CommonJS, native ESM, and configured TypeScript hooks participate in
  the covered Jest lifecycle.
- Setup environment changes are visible to test code and child processes.
- Shared hook paths execute once and inactive projects execute no hooks.
- Teardown still runs after ordinary test failures; setup/teardown failures
  stop result emission with exit code 1.
- Arbitrary non-environment JavaScript object identity cannot cross from the
  hook process into isolated test workers. Such values remain available to
  teardown in the persistent hook process.
- A dependency that requires an async-only transform from synchronous CommonJS
  loading is not supported by this bridge yet.

The behavior is protected by permanent differential fixtures against official
Jest, including failures and multi-project selection.
