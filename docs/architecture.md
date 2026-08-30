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
  snapshots, fake timers, configured sync/async transforms, JSDOM globals,
  custom-environment lifecycle bridging, async timeouts, and per-file execution
  inside Node.

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
Implicit discovery is version-aware at one compatibility boundary: installed
Jest versions before 30.4 did not consider `jest.config.mts`, while newer Jest
versions do. Rjest reads the local `jest-config` or `jest` package version when
available so an existing project's discovery behavior remains stable during
migration; explicit config paths remain directly loadable.
On Node versions with native TypeScript support, `.ts`, `.cts`, and `.mts`
configuration first uses Node's package-aware module semantics. `.ts` and
`.cts` fall back to the CommonJS ts-node bridge only for native syntax errors;
`.mts` is never reinterpreted as CommonJS. This preserves `import.meta` in
type-module projects such as Apollo Client without breaking older CommonJS
TypeScript configs.

Inline Jest project entries are normalized recursively into independent typed
configs. The Rust coordinator discovers and executes every project separately,
attaches its display name to results, and then merges deterministic test,
snapshot, duration, and coverage state. This deliberately allows the same file
path to run more than once under different dependency mappings. List mode
deduplicates those paths to match Jest. String project directories, config-file
paths, and standard path globs are resolved before child normalization, with
Jest's distinct parent-root and parent-config anchors and duplicate-config
rejection. Preset evaluation happens before normalization and uses the same
trusted Node config boundary, with explicit merge rules for setup arrays,
module mappings, and transforms.
CLI `--projects` paths use the same child loader without glob expansion; the
first child supplies coordinator defaults when several paths are provided.

Worker protocol v20 carries the supported snapshot-format options. Project
identity remains coordinator-owned because a worker executes one fully
normalized project/file pair and should not need root-configuration context.

Module loading normally delegates to Node and the configured Jest-compatible
resolver layers. Under a genuine Yarn Plug'n'Play preload, the worker also
loads Yarn's special `pnpapi` module and supplies Jest's mode-specific
conditions and configured extensions. Node 25 routes both ESM and CommonJS
requests through the synchronous customization hook, so Rjest detects the
request mode and preserves `require` versus `import` export selection. The
recursion and internal-URL boundaries are recorded in
[ADR 0026](adr/0026-yarn-pnp-resolution.md).
