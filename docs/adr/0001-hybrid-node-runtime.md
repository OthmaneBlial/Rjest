# ADR 0001: Rust coordinator with isolated Node workers

- Status: accepted
- Date: 2026-08-29

## Context

Rjest needs Node module semantics and ecosystem compatibility while moving
discovery, scheduling, process supervision, aggregation, caching, and other
coordination work into Rust. Embedding a non-Node JavaScript engine would make
CommonJS, ESM, native addons, package exports, and Jest transformer compatibility
a separate long-running reimplementation before ordinary projects can run.

## Decision

Use a Rust coordinator that owns configuration normalization, file discovery,
scheduling, process lifecycle, deterministic aggregation, caches, and reporting.
Execute untrusted test code in bounded Node worker processes over a versioned,
validated JSON-lines protocol.

The initial bridge will use Node's native loader and type stripping where it is
correct. Transform adapters will be isolated behind a transform protocol. This
does not make tests sandboxed: workers execute with the invoking user's normal
permissions.

## Consequences

- Real Node projects get correct process and module boundaries early.
- Crashes and leaked handles can be isolated and workers can be restarted.
- Worker startup and IPC must be benchmarked and amortized.
- Rust remains the product coordinator rather than a thin launcher.
- A future embedded runtime remains possible for constrained workloads, but is
  not on the critical compatibility path.
