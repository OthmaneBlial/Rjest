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
- `rjest-dependency`: Git working-tree change discovery, project module
  indexing, Jest-style static dependency extraction, resolver bridging, and
  inverse transitive affected-test selection.
- `rjest-runner`: bounded parallel dispatch, Node process isolation, versioned
  request/result validation, thread-safe file lifecycle observation,
  deterministic aggregation, Istanbul counter merging, and raw V8 range
  aggregation before conversion.
- `rjest-snapshot`: safe Jest v1 snapshot parsing, natural key ordering,
  template-literal escaping, deterministic coordinator-side persistence, and
  obsolete-file cleanup.
- `rjest-watch`: native recursive filesystem subscriptions, Jest regex ignores,
  generated-output filtering, root de-duplication, and event debouncing.
- `runtime/worker.mjs`: Jest-style declaration, hooks, assertions, mocks,
  snapshots, fake timers, configured sync/async transforms, JSDOM globals,
  custom-environment lifecycle bridging, async timeouts, and per-file execution
  inside Node.
- `runtime/v8-coverage.mjs`: one coordinator-side conversion pass over merged
  worker ranges, transformed-source metadata, source maps, and zero-hit
  `collectCoverageFrom` files.
- `runtime/custom-reporters.mjs`: persistent CommonJS/ESM reporter loading,
  serialized Jest lifecycle dispatch, result projection, and final reporter
  error collection across the Rust-coordinated run.
- `runtime/global-hooks.mjs`: persistent CommonJS/ESM global setup and teardown,
  configured transformer execution, project-aware deduplication, and explicit
  environment transfer to later reporter and test-worker processes.

Workers currently receive one JSON request over stdin and return a prefixed,
versioned JSON result. Snapshot content crosses that protocol as validated data:
Node matches and serializes runtime values, while Rust owns external `.snap`
loading and persistence without evaluating snapshot files as JavaScript. Rust
also bounds process concurrency, rejects malformed or mismatched results, and
sorts aggregation by canonical path. Each file gets a fresh process, which
isolates global state and crashes at the cost of startup overhead. A coordinator
wall-clock limit terminates a worker whose event loop is synchronously blocked.
Worker reuse and cooperative cancellation remain future work.

`--watchAll` starts the native watcher before its initial execution cycle, then
re-enters the same discovery, sequencing, hook, reporter, coverage, and result
pipeline after each settled filesystem batch. Re-discovery on every cycle is
deliberate: added and deleted test files cannot be represented by reusing the
previous file list. Cache, coverage, and JSON output paths are filtered at the
watch boundary to prevent coordinator-generated files from causing loops.

`--watch` uses that same native event loop but computes the selected suite set
from the current Git working tree before every cycle. Rust discovers staged,
modified, deleted, and untracked paths, then owns inverse transitive traversal
over a project-local dependency graph. A short-lived Node bridge extracts the
same static import/require forms used by Jest's haste dependency extractor and
resolves them through module mappings, configured module directories/paths,
custom synchronous resolvers, and the packaged resolver engine. Changed test
files and snapshot files map directly to their owning suites. An async-only
custom resolver makes selection conservatively fall back to every discovered
test rather than risk a false negative. Rjest rejects `--watch` outside Git and
directs the user to `--watchAll`, matching Jest's no-SCM control flow; Mercurial
and Sapling adapters remain future work.

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
Display-name selection and ignore predicates filter the normalized matrix before
discovery, sharding, or worker scheduling.
Default sharding then hashes each selected test relative to its owning project
root across one combined matrix; it does not reuse the coordinator's root for
child projects.

Worker protocol v27 carries assertion ancestor titles/counts, the normalized
`injectGlobals` mode, optional test-declaration locations, live test-case
lifecycle events used by reporter payloads, and raw V8 coverage plus transform
metadata when that provider is active. Project identity remains
coordinator-owned because a worker executes one fully normalized project/file
pair and should not need root-configuration context. Custom reporters use a
separate persistent line protocol: Rust observes live file and
case events while the Node bridge preserves plugin instances and dispatches
awaited run, file, case, and completion callbacks. Worker event frames are
parsed concurrently with process execution, including after raw application
stdout that does not end with a newline.

Global setup and teardown use another persistent line protocol. Rust derives
the active hook set only after project filtering, sharding, and sequencing, so
an inactive project cannot run its hook and a shared resolved module path runs
once. The Node process executes all setup modules before reporters or workers
are created, stays alive through the test run, and then executes teardown after
reporter completion. Environment differences produced by setup are attached to
every later Node child with `Command::env`/`env_remove`; this avoids unsafe
process-wide environment mutation inside the multithreaded Rust coordinator.
The hook process itself retains ordinary module and global state for teardown.
Arbitrary non-environment object identity cannot cross into isolated workers.

Module loading normally delegates to Node and the configured Jest-compatible
resolver layers. Under a genuine Yarn Plug'n'Play preload, the worker also
loads Yarn's special `pnpapi` module and supplies Jest's mode-specific
conditions and configured extensions. Node 25 routes both ESM and CommonJS
requests through the synchronous customization hook, so Rjest detects the
request mode and preserves `require` versus `import` export selection. The
recursion and internal-URL boundaries are recorded in
[ADR 0026](adr/0026-yarn-pnp-resolution.md).
