# Architecture

Rjest is a native Rust coordinator around isolated JavaScript execution workers.
The architecture follows the boundary recorded in
[ADR 0001](adr/0001-hybrid-node-runtime.md).

## Current components

- `rjest-cli`: command-line contract and exit behavior.
- `rjest-config`: configuration discovery, validation, and strong normalization.
- `rjest-discovery`: native recursive scanning, matching, filtering, and stable
  ordering.
- `rjest-core`: stable cross-component data types.
- `rjest-runner`: bounded parallel dispatch, Node process isolation, versioned
  request/result validation, and deterministic aggregation.
- `runtime/worker.mjs`: Jest-style declaration, hooks, assertions, mocks, async
  timeouts, and per-file execution inside Node.

Workers currently receive one JSON request over stdin and return a prefixed,
versioned JSON result. Rust bounds process concurrency, rejects malformed or
mismatched results, and sorts aggregation by canonical path. Each file gets a
fresh process, which isolates global state and crashes at the cost of startup
overhead. Worker reuse, cancellation, and restart policy remain future work.

Test processes run with the invoking user's permissions. Process isolation is a
reliability boundary, not a security sandbox.
