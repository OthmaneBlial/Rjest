# Architecture

Rjest is a native Rust coordinator around isolated JavaScript execution workers.
The architecture follows the boundary recorded in
[ADR 0001](adr/0001-hybrid-node-runtime.md).

## Current components

- `rjest-cli`: command-line contract and exit behavior.
- `rjest-config`: Jest-order configuration discovery, multiple-source detection,
  Node evaluation bridge, JSON compatibility validation, and strong Rust
  normalization.
- `rjest-discovery`: native recursive scanning, matching, filtering, and stable
  ordering.
- `rjest-core`: stable cross-component data types.
- `rjest-coverage`: Istanbul source discovery, deterministic worker-map merging,
  reports, and threshold evaluation.
- `rjest-runner`: bounded parallel dispatch, Node process isolation, versioned
  request/result validation, deterministic aggregation, and coverage-counter
  merging.
- `rjest-snapshot`: safe Jest v1 snapshot parsing, natural key ordering,
  template-literal escaping, deterministic coordinator-side persistence, and
  obsolete-file cleanup.
- `runtime/worker.mjs`: Jest-style declaration, hooks, assertions, mocks,
  snapshots, fake timers, configured transforms, JSDOM globals, async timeouts,
  and per-file execution inside Node.

Workers currently receive one JSON request over stdin and return a prefixed,
versioned JSON result. Snapshot content crosses that protocol as validated data:
Node matches and serializes runtime values, while Rust owns external `.snap`
loading and persistence without evaluating snapshot files as JavaScript. Rust
also bounds process concurrency, rejects malformed or mismatched results, and
sorts aggregation by canonical path. Each file gets a fresh process, which
isolates global state and crashes at the cost of startup overhead. A coordinator
wall-clock limit terminates a worker whose event loop is synchronously blocked.
Worker reuse and cooperative cancellation remain future work.

Test processes run with the invoking user's permissions. Process isolation is a
reliability boundary, not a security sandbox.

Executable Jest configuration is also trusted user code. Rjest evaluates it in a
short-lived Node process, requires the exported value to be JSON-compatible, and
then applies the same strict Rust validation used for JSON/package configuration.
