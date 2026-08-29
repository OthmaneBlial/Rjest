# ADR 0008: Propagate deep unmock decisions from the loading parent

- Status: accepted
- Date: 2026-08-29

## Context

`jest.deepUnmock` makes a CommonJS target and the dependencies reached through
that target actual even when automocking is enabled. The same dependency loaded
directly from an ordinary parent must still be mockable, while an explicit mock
factory inside the deeply unmocked graph must retain priority. Decisions survive
`resetModules` and must terminate safely on cycles.

A global set of unmocked target paths cannot represent these rules: it would
incorrectly make a transitive dependency actual when later loaded from the test
file itself.

## Decision

Record deep roots separately from ordinary explicit unmock decisions. Whenever
the CommonJS loader resolves a dependency, inspect the resolved parent path. If
the parent is a deep root or a previously reached transitive node, load the
child as actual and record it as a transitive parent for its own descendants.

Keep generated and explicit module-mock entries distinguishable. A cached
generated entry is bypassed on a deep edge, including after `resetModules`, but
an explicit factory or factory-less explicit mock wins before propagation.
Do not use a transitive node's own path to decide how an ordinary parent imports
that node.

## Consequences

- Nested and cyclic CommonJS graphs remain actual beneath a deep root.
- Ordinary `unmock` remains shallow.
- A dependency reached through a deep root can still be automocked when loaded
  directly from the test module.
- Explicit factories inside the graph retain Jest priority.
- Deep decisions persist while module and generated-mock instances reset.
