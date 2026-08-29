# Jest compatibility

Compatibility is tracked in the machine-readable
[`compat/jest-compatibility.json`](../compat/jest-compatibility.json) matrix.
Counts come only from executable Rust and Jest/Rjest differential tests;
placeholders are never counted. The differential harness normalizes test names,
statuses, files, and exit codes while deliberately ignoring timing and cosmetic
output differences.

The current alpha supports JSON/package and executable JavaScript/TypeScript
configuration, native discovery, isolated JS execution, configured synchronous
Jest transforms for JSX/TypeScript, Node and JSDOM environments, nested hooks,
async tests, common matchers, function/method/accessor mocks, CommonJS module
mocks, external Jest v1 snapshots, existing inline snapshots, configured
serializers, snapshot property matchers, modern fake timers, and ordered
`moduleNameMapper` rules for CommonJS and transformed modules. Configured and
runtime CommonJS automocking covers recursive exports and classes, while
Babel-Jest hoists standard mock factories. Babel coverage supports parallel
Istanbul-map merging, `collectCoverageFrom`, common reports, and global
thresholds. Manual `__mocks__` lookup, writing new inline snapshots, complete
resolution/config semantics, V8 coverage, path/glob threshold groups, and watch
mode remain missing, so Rjest does not claim broad or drop-in Jest compatibility
yet.

The modern timer surface includes animation-frame scheduling, cancellation,
timestamps, and `advanceTimersToNextFrame` in JSDOM. Legacy fake-timer mode is a
separate unimplemented path.

Native Node resolution is verified for relative CommonJS/ESM modules, package
self-references and `exports`, and scoped packages under `node_modules`.
CommonJS mapping is verified for capture expansion, first-match ordering,
fallback targets, `require.resolve`, and Jest mock identity. Native-ESM mapping,
custom module directories, and pnpm/Yarn PnP layouts remain open work.

Run the oracle locally with `npm run compat`; `make check` includes it.

The real-project corpus is reported separately from the scenario score. On the
pinned Downshift checkout and dependency installation, both official Jest and
Rjest discover and pass 92/92 suites, 1,110/1,110 tests, and 49/49 snapshot
assertions. This establishes compatibility for that exact corpus, not for
unmeasured Jest behavior. The pinned versions and commands are in the
[Downshift corpus report](corpus/downshift.md).

The pinned [React Select corpus](corpus/react-select.md) adds an older Jest 25,
Babel 23, React 16, TSX, JSDOM, Emotion-serializer workload: both runners agree
on 5/5 suites, 255 passing tests, 3 skipped tests, and 5/5 snapshots. Coverage
also matches across 39 files: 1,064/1,438 statements, 659/1,054 branches,
251/312 functions, and 1,033/1,363 lines. The upstream `jest --coverage` script
can therefore be replaced by `rjest --coverage` on this pinned checkout.

Executable configuration runs with the user's normal Node permissions, just like
Jest config. Rjest currently accepts the supported normalized subset and fails on
unknown fields rather than silently discarding them.
