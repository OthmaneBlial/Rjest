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

Upcoming runtime components will communicate through a versioned JSON-lines
protocol. Rust will bound worker count, own cancellation, validate messages, and
aggregate results deterministically. Test processes are isolated for reliability
but are not security sandboxes.
