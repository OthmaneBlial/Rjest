# ADR 0017: Select test-file shards in the Rust coordinator

- Status: accepted
- Date: 2026-08-30

## Context

Jest applies sharding after discovery and before its sequencer sorts tests. The
default sequencer hashes each root-relative POSIX test path with SHA-1, sorts by
that digest, then splits the ordered list into balanced contiguous partitions.
Earlier shards receive one extra file when the test count is uneven.

## Decision

Parse `--shard=index/count` as a strict one-based pair in the CLI. Reject
non-integers, extra components, zero values, and indices larger than the shard
count before execution. After native discovery, normalize each path relative to
the configured root, SHA-1 hash its slash-separated representation, and select
the requested balanced range before list output or worker scheduling.

Use the maintained Rust `sha1` crate instead of shelling out or routing native
discovery results through Node. Preserve Rjest's deterministic aggregation after
selection.

## Consequences

- Every file belongs to exactly one shard and the union of all shards recovers
  the discovered set.
- The selected file identities match Jest across identity, even, and uneven
  partitions.
- Empty list-mode shards succeed like Jest; ordinary execution still follows
  the existing no-tests exit policy.
- Custom Jest sequencers remain outside the current extension surface.
